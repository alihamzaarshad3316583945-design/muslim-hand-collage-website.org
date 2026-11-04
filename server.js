const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const express = require('express');
const Database = require('better-sqlite3');
const session = require('express-session');
require('dotenv').config();

const app = express();
const port = Number(process.env.PORT) || 3000;
const siteRoot = __dirname;
const usesDefaultAuthDbPath = !process.env.AUTH_DB_PATH;
const defaultAuthDbDirectory = path.join(os.homedir(), '.muslim-hands-college');
const authDbPath = process.env.AUTH_DB_PATH
  ? path.resolve(process.env.AUTH_DB_PATH)
  : path.join(defaultAuthDbDirectory, `${path.basename(siteRoot)}.sqlite`);
const relativeAuthDbPath = path.relative(siteRoot, authDbPath);
if (
  relativeAuthDbPath === '' ||
  (relativeAuthDbPath !== '..' && !relativeAuthDbPath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativeAuthDbPath))
) {
  throw new Error('AUTH_DB_PATH must be outside the public website directory.');
}
const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const requestCounts = new Map();
const rateLimitWindowMs = 60 * 1000;
const maxRequestsPerWindow = 20;
const authAttempts = new Map();
const authWindowMs = 15 * 60 * 1000;
const maxAuthAttemptsPerWindow = 10;
const scrypt = promisify(crypto.scrypt);
const passwordKeyLength = 64;

fs.mkdirSync(path.dirname(authDbPath), { recursive: true, mode: usesDefaultAuthDbPath ? 0o700 : 0o777 });
if (usesDefaultAuthDbPath && process.platform !== 'win32') {
  fs.chmodSync(defaultAuthDbDirectory, 0o700);
}
const authDb = new Database(authDbPath);
if (process.platform !== 'win32') fs.chmodSync(authDbPath, 0o600);
authDb.pragma('journal_mode = WAL');
authDb.pragma('foreign_keys = ON');
authDb.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    full_name TEXT NOT NULL,
    username TEXT UNIQUE COLLATE NOCASE,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    role TEXT NOT NULL CHECK (role IN ('student', 'teacher', 'admin')),
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expires INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires);
`);

class SQLiteSessionStore extends session.Store {
  get(sid, callback) {
    try {
      const row = authDb.prepare('SELECT sess, expires FROM sessions WHERE sid = ?').get(sid);
      if (!row || row.expires <= Date.now()) {
        if (row) authDb.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
        return callback(null, null);
      }
      return callback(null, JSON.parse(row.sess));
    } catch (error) {
      return callback(error);
    }
  }

  set(sid, sess, callback = () => {}) {
    try {
      const expires = sess.cookie && sess.cookie.expires
        ? new Date(sess.cookie.expires).getTime()
        : Date.now() + 8 * 60 * 60 * 1000;
      authDb.prepare(`
        INSERT INTO sessions (sid, sess, expires) VALUES (?, ?, ?)
        ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires = excluded.expires
      `).run(sid, JSON.stringify(sess), expires);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  destroy(sid, callback = () => {}) {
    try {
      authDb.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  touch(sid, sess, callback = () => {}) {
    try {
      const expires = sess.cookie && sess.cookie.expires
        ? new Date(sess.cookie.expires).getTime()
        : Date.now() + 8 * 60 * 60 * 1000;
      authDb.prepare('UPDATE sessions SET expires = ? WHERE sid = ?').run(expires, sid);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }
}

const adminUsername = (process.env.ADMIN_USERNAME || '').trim().toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD || '';
if (Boolean(adminUsername) !== Boolean(adminPassword)) {
  throw new Error('Set both ADMIN_USERNAME and ADMIN_PASSWORD to configure the administrator account.');
}
if (adminUsername) {
  if (!/^[a-z0-9._-]{3,32}$/.test(adminUsername)) {
    throw new Error('ADMIN_USERNAME must be 3–32 characters using letters, numbers, dots, underscores, or hyphens.');
  }
  if (process.env.NODE_ENV === 'production' && adminPassword.length < 12) {
    throw new Error('ADMIN_PASSWORD must contain at least 12 characters in production.');
  }
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(adminPassword, salt, passwordKeyLength);
  authDb.prepare(`
    INSERT INTO users (full_name, username, email, role, password_hash, password_salt)
    VALUES ('College Administrator', ?, ?, 'admin', ?, ?)
    ON CONFLICT(username) DO NOTHING
  `).run(
    adminUsername,
    `${adminUsername}@accounts.invalid`,
    hash.toString('hex'),
    salt.toString('hex')
  );
  if (process.env.NODE_ENV !== 'production' && adminPassword.length < 12) {
    console.warn('The configured admin password is short; use a strong unique password before deployment.');
  }
} else if (process.env.NODE_ENV === 'production') {
  throw new Error('Configure ADMIN_USERNAME and ADMIN_PASSWORD before starting in production.');
}

authDb.prepare('DELETE FROM sessions WHERE expires <= ?').run(Date.now());
const sessionCleanup = setInterval(() => {
  authDb.prepare('DELETE FROM sessions WHERE expires <= ?').run(Date.now());
}, 60 * 60 * 1000);
sessionCleanup.unref();

const systemPrompt = [
  'You are the Muslim Hands College of Excellence website assistant.',
  'Be helpful, concise, and respectful. Answer general questions when you can.',
  'Do not invent or claim official college facts, contact details, staff, admissions rules, fees, results, or facilities.',
  'If a college-specific fact is not provided in the conversation, say you cannot verify it and direct the visitor to the official college contact page.',
  'Do not claim to have performed actions such as submitting a form or contacting the college.'
].join(' ');

app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use(express.json({ limit: '64kb', strict: true }));
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.SESSION_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('Set SESSION_SECRET to a long, random value before starting in production.');
}
app.use(session({
  name: 'mhcollege.sid',
  secret: sessionSecret,
  store: new SQLiteSessionStore(),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000
  }
}));

const authRateLimit = (req, res, next) => {
  const now = Date.now();
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const current = authAttempts.get(clientIp);

  if (!current || now - current.startedAt >= authWindowMs) {
    authAttempts.set(clientIp, { startedAt: now, count: 1 });
  } else if (current.count >= maxAuthAttemptsPerWindow) {
    res.setHeader('Retry-After', String(Math.ceil((authWindowMs - (now - current.startedAt)) / 1000)));
    return res.status(429).json({ error: 'Too many authentication attempts. Please wait and try again.' });
  } else {
    current.count += 1;
  }

  if (authAttempts.size > 1000) {
    for (const [ip, entry] of authAttempts) {
      if (now - entry.startedAt >= authWindowMs) authAttempts.delete(ip);
    }
  }
  return next();
};

const createSession = (req, res, user) => {
  req.session.regenerate((error) => {
    if (error) return res.status(500).json({ error: 'Could not create a secure session. Please try again.' });
    req.session.user = { id: user.id, name: user.full_name, role: user.role };
    req.session.save((saveError) => {
      if (saveError) return res.status(500).json({ error: 'Could not save your session. Please try again.' });
      return res.json({ user: req.session.user });
    });
  });
};

app.get('/api/auth/me', (req, res) => {
  if (!req.session.user) return res.json({ user: null });
  const user = authDb.prepare(`
    SELECT id, full_name AS name, role, status
    FROM users WHERE id = ?
  `).get(req.session.user.id);
  if (!user || user.status !== 'active') {
    return req.session.destroy((error) => {
      if (error) return res.status(500).json({ error: 'Could not refresh the sign-in status.' });
      return res.json({ user: null });
    });
  }
  req.session.user = { id: user.id, name: user.name, role: user.role };
  return res.json({ user: req.session.user });
});

app.post('/api/auth/signup', authRateLimit, async (req, res, next) => {
  try {
    const fullName = typeof req.body.fullName === 'string' ? req.body.fullName.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const studentNumber = typeof req.body.studentNumber === 'string' ? req.body.studentNumber.trim() : '';
    const classId = Number(req.body.classId);
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const confirmPassword = typeof req.body.confirmPassword === 'string' ? req.body.confirmPassword : '';

    if (fullName.length < 2 || fullName.length > 100) {
      return res.status(400).json({ error: 'Enter a name between 2 and 100 characters.' });
    }
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    if (studentNumber.length < 1 || studentNumber.length > 40) {
      return res.status(400).json({ error: 'Enter a student roll number between 1 and 40 characters.' });
    }
    if (!Number.isSafeInteger(classId) || classId < 1) {
      return res.status(400).json({ error: 'Choose a valid class or program.' });
    }
    if (password.length < 10 || password.length > 128) {
      return res.status(400).json({ error: 'Choose a password between 10 and 128 characters.' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Your passwords do not match.' });
    }
    if (req.body.terms !== true) {
      return res.status(400).json({ error: 'Please accept the Terms & Conditions to create an account.' });
    }
    if (!authDb.prepare('SELECT id FROM classes WHERE id = ?').get(classId)) {
      return res.status(400).json({ error: 'The selected class is no longer available. Refresh and choose another class.' });
    }
    if (authDb.prepare(`
      SELECT 1 FROM users
      WHERE role = 'student' AND lower(trim(student_number)) = lower(trim(?))
      LIMIT 1
    `).get(studentNumber)) {
      return res.status(409).json({ error: 'That student roll number is already in use.' });
    }

    const salt = crypto.randomBytes(16);
    const hash = await scrypt(password, salt, passwordKeyLength);
    const result = authDb.prepare(`
      INSERT INTO users (full_name, email, role, password_hash, password_salt, student_number, class_id)
      VALUES (?, ?, 'student', ?, ?, ?, ?)
    `).run(fullName, email, hash.toString('hex'), salt.toString('hex'), studentNumber, classId);
    return createSession(req, res, { id: result.lastInsertRowid, full_name: fullName, role: 'student' });
  } catch (error) {
    if (error.message && error.message.includes('student number already exists')) {
      return res.status(409).json({ error: 'That student roll number is already in use.' });
    }
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
    return next(error);
  }
});

app.post('/api/auth/login', authRateLimit, async (req, res, next) => {
  try {
    const identity = typeof req.body.identity === 'string' ? req.body.identity.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const role = typeof req.body.role === 'string' ? req.body.role : '';
    if (!identity || identity.length > 254 || password.length > 128 || !['student', 'teacher', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Check your login details and selected account type.' });
    }

    const user = authDb.prepare(`
      SELECT id, full_name, role, password_hash, password_salt, status
      FROM users
      WHERE (username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE) AND role = ?
    `).get(identity, identity, role);
    if (!user || user.status !== 'active') return res.status(401).json({ error: 'The account type or login details are incorrect.' });

    const salt = Buffer.from(user.password_salt, 'hex');
    const expected = Buffer.from(user.password_hash, 'hex');
    const actual = await scrypt(password, salt, expected.length);
    if (!crypto.timingSafeEqual(expected, actual)) {
      return res.status(401).json({ error: 'The account type or login details are incorrect.' });
    }
    return createSession(req, res, user);
  } catch (error) {
    return next(error);
  }
});

app.post('/api/auth/logout', (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie('mhcollege.sid', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    });
    return res.json({ success: true });
  });
});

const rateLimit = (req, res, next) => {
  const now = Date.now();
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const current = requestCounts.get(clientIp);

  if (!current || now - current.startedAt >= rateLimitWindowMs) {
    requestCounts.set(clientIp, { startedAt: now, count: 1 });
  } else if (current.count >= maxRequestsPerWindow) {
    res.setHeader('Retry-After', String(Math.ceil((rateLimitWindowMs - (now - current.startedAt)) / 1000)));
    return res.status(429).json({ error: 'Too many assistant requests. Please wait a minute and try again.' });
  } else {
    current.count += 1;
  }

  if (requestCounts.size > 1000) {
    for (const [ip, entry] of requestCounts) {
      if (now - entry.startedAt >= rateLimitWindowMs) requestCounts.delete(ip);
    }
  }
  return next();
};

app.get('/api/health', (req, res) => {
  res.json({ configured: Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim()) });
});

app.post('/api/chat', rateLimit, async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim();
  if (!apiKey) {
    return res.status(503).json({ error: 'AI chat is not configured on this server. Add an OpenAI API key to the server .env file.' });
  }

  const messages = req.body && req.body.messages;
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 10) {
    return res.status(400).json({ error: 'Send between 1 and 10 conversation messages.' });
  }

  let totalCharacters = 0;
  const validatedMessages = [];
  for (const message of messages) {
    if (!message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string') {
      return res.status(400).json({ error: 'Each message must contain a supported role and text content.' });
    }
    const content = message.content.trim();
    if (!content || content.length > 2000) {
      return res.status(400).json({ error: 'Each message must contain between 1 and 2000 characters.' });
    }
    totalCharacters += content.length;
    validatedMessages.push({ role: message.role, content });
  }

  if (totalCharacters > 10000 || validatedMessages[validatedMessages.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'The conversation is too long or does not end with a user question.' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 40000);
  let upstream;
  try {
    upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...validatedMessages]
      }),
      signal: controller.signal
    });
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      return res.status(504).json({ error: 'The AI service took too long to respond. Please try again.' });
    }
    console.error('OpenAI API request could not reach the service.');
    return res.status(502).json({ error: 'The AI service is temporarily unreachable. Check the server connection and try again.' });
  }

  let result;
  try {
    result = await upstream.json();
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      return res.status(504).json({ error: 'The AI service took too long to respond. Please try again.' });
    }
    console.error(`OpenAI API returned an unreadable response (HTTP ${upstream.status}).`);
    return res.status(502).json({ error: 'The AI service returned an invalid response. Please try again.' });
  }
  clearTimeout(timeout);

  if (!upstream.ok) {
    console.error(`OpenAI API request failed with HTTP ${upstream.status}.`);
    if (upstream.status === 401 || upstream.status === 403) {
      return res.status(503).json({ error: 'The AI service credentials are not configured correctly. Contact the site administrator.' });
    }
    if (upstream.status === 429) {
      return res.status(503).json({ error: 'The AI service is temporarily rate-limited. Please try again later.' });
    }
    return res.status(502).json({ error: 'The AI service could not complete this request. Check the model configuration and try again.' });
  }

  const reply = result && result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content;
  if (typeof reply !== 'string' || !reply.trim()) {
    console.error('OpenAI API returned no assistant message.');
    return res.status(502).json({ error: 'The AI service returned no answer. Please try again.' });
  }

  return res.json({ reply: reply.trim() });
});

require('./management-api')(app, authDb, { scrypt, passwordKeyLength, authRateLimit });

app.use(express.static(siteRoot, { extensions: ['html'], index: 'index.html' }));

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found.' });
  }
  return res.status(404).sendFile(path.join(siteRoot, '404.html'));
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'The request is too large. Shorten your message and try again.' });
  }
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({ error: 'The request body must be valid JSON.' });
  }
  console.error('An unexpected server error occurred.');
  return res.status(500).json({ error: 'An unexpected server error occurred. Please try again.' });
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Muslim Hands College website is running at http://localhost:${port}`);
  });
}

module.exports = app;
