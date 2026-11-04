const express = require('express');
const crypto = require('node:crypto');

const roles = new Set(['admin', 'teacher', 'student']);
const attendanceStatuses = new Set(['present', 'absent', 'late']);
const noticeAudiences = new Set(['all', 'student', 'teacher']);
const transferConfirmation = 'TRANSFER ADMIN OWNERSHIP';

module.exports = (app, db, { scrypt, passwordKeyLength, authRateLimit }) => {
  const columns = new Set(db.prepare('PRAGMA table_info(users)').all().map((column) => column.name));
  const addUserColumn = (name, declaration) => {
    if (!columns.has(name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} ${declaration}`);
  };
  addUserColumn('status', "TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted'))");
  addUserColumn('student_number', 'TEXT');
  addUserColumn('phone', 'TEXT');
  addUserColumn('class_id', 'INTEGER');

  db.exec(`
    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE COLLATE NOCASE,
      academic_year TEXT NOT NULL DEFAULT '',
      teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS admissions (
      id INTEGER PRIMARY KEY,
      full_name TEXT NOT NULL,
      guardian_name TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      program TEXT NOT NULL,
      message TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'reviewing', 'contacted', 'accepted', 'declined')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS admissions_created_idx ON admissions(created_at DESC);
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
      attendance_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late')),
      marked_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, attendance_date)
    );
    CREATE INDEX IF NOT EXISTS attendance_date_class_idx ON attendance(attendance_date, class_id);
    CREATE INDEX IF NOT EXISTS attendance_student_date_idx ON attendance(student_id, attendance_date);
    CREATE TABLE IF NOT EXISTS fees (
      id INTEGER PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      label TEXT NOT NULL,
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      paid_cents INTEGER NOT NULL DEFAULT 0 CHECK (paid_cents >= 0 AND paid_cents <= amount_cents),
      due_date TEXT NOT NULL,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS results (
      id INTEGER PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      exam_name TEXT NOT NULL,
      subject TEXT NOT NULL,
      score REAL NOT NULL CHECK (score >= 0),
      maximum_score REAL NOT NULL CHECK (maximum_score > 0 AND score <= maximum_score),
      published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      UNIQUE(student_id, exam_name, subject)
    );
    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      due_date TEXT NOT NULL,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS assignments_class_due_idx ON assignments(class_id, due_date);
    CREATE TRIGGER IF NOT EXISTS unique_student_number_insert
    BEFORE INSERT ON users
    WHEN NEW.role = 'student' AND NEW.student_number IS NOT NULL AND trim(NEW.student_number) != ''
      AND EXISTS (
        SELECT 1 FROM users
        WHERE role = 'student' AND lower(trim(student_number)) = lower(trim(NEW.student_number))
      )
    BEGIN
      SELECT RAISE(ABORT, 'student number already exists');
    END;
    CREATE TRIGGER IF NOT EXISTS unique_student_number_update
    BEFORE UPDATE OF role, student_number ON users
    WHEN NEW.role = 'student' AND NEW.student_number IS NOT NULL AND trim(NEW.student_number) != ''
      AND EXISTS (
        SELECT 1 FROM users
        WHERE id != NEW.id AND role = 'student'
          AND lower(trim(student_number)) = lower(trim(NEW.student_number))
      )
    BEGIN
      SELECT RAISE(ABORT, 'student number already exists');
    END;
    CREATE TABLE IF NOT EXISTS notices (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      audience TEXT NOT NULL CHECK (audience IN ('all', 'student', 'teacher')),
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS personal_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      full_name TEXT NOT NULL,
      profile_name TEXT NOT NULL,
      location TEXT NOT NULL,
      background TEXT NOT NULL,
      profession TEXT NOT NULL,
      education TEXT NOT NULL,
      college TEXT NOT NULL,
      bio TEXT NOT NULL DEFAULT '',
      skills TEXT NOT NULL DEFAULT '[]',
      avatar_url TEXT NOT NULL DEFAULT '',
      tiktok_url TEXT NOT NULL DEFAULT '',
      instagram_url TEXT NOT NULL DEFAULT '',
      facebook_url TEXT NOT NULL DEFAULT '',
      behance_url TEXT NOT NULL DEFAULT '',
      linkedin_url TEXT NOT NULL DEFAULT '',
      website_url TEXT NOT NULL DEFAULT '',
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS timetable (
      id INTEGER PRIMARY KEY,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
      weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      subject TEXT NOT NULL,
      room TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id INTEGER,
      details TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS activity_log_created_idx ON activity_log(created_at DESC);
    INSERT OR IGNORE INTO settings (key, value) VALUES
      ('college_name', 'Muslim Hands College of Excellence'),
      ('academic_year', '2026–2027'),
      ('term', 'First Term'),
      ('currency', 'PKR');
  `);

  app.get('/api/auth/classes', (req, res) => {
    const classes = db.prepare('SELECT id, name, code FROM classes ORDER BY name COLLATE NOCASE').all();
    return res.json({ classes });
  });

  const router = express.Router();
  const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
  const fail = (res, status, error) => res.status(status).json({ error });
  const text = (value) => typeof value === 'string' ? value.trim() : '';
  const isDate = (value) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };
  const parseId = (value) => {
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  };
  const logActivity = (actorId, action, entity, entityId, details = {}) => {
    db.prepare(`
      INSERT INTO activity_log (actor_id, action, entity, entity_id, details)
      VALUES (?, ?, ?, ?, ?)
    `).run(actorId, action, entity, entityId || null, JSON.stringify(details));
  };
  const profileOwnerUsername = (process.env.PROFILE_OWNER_USERNAME || 'alikashmiri084').trim().toLowerCase();
  db.prepare(`
    INSERT OR IGNORE INTO personal_profile
      (id, full_name, profile_name, location, background, profession, education, college,
       bio, skills, tiktok_url, website_url)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'Ali Hamza',
    'Ali Kashmiri',
    'Wazirabad, Pakistan',
    'From Kashmir',
    'UX/UI Designer & Web Designer',
    'Matriculation in Science Subjects',
    'Muslim Hands College of Excellence',
    'I am a UX/UI and web designer with a science education and a focus on clear, thoughtful digital experiences.',
    JSON.stringify(['Figma', 'UI/UX Design', 'Website Design', 'Social Media Marketing']),
    'https://www.tiktok.com/@alikashmiri084',
    'https://alihamzawebdesigner.com'
  );
  const readProfile = () => {
    const row = db.prepare(`
      SELECT full_name AS fullName, profile_name AS profileName, location, background,
        profession, education, college, bio, skills, avatar_url AS avatarUrl,
        tiktok_url AS tiktokUrl, instagram_url AS instagramUrl,
        facebook_url AS facebookUrl, behance_url AS behanceUrl,
        linkedin_url AS linkedinUrl, website_url AS websiteUrl, updated_at AS updatedAt
      FROM personal_profile WHERE id = 1
    `).get();
    return { ...row, skills: JSON.parse(row.skills) };
  };
  const validHttpsUrl = (value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password && value.length <= 2048;
    } catch {
      return false;
    }
  };

  app.get('/api/profile', (req, res, next) => {
    try {
      const account = req.session && req.session.user
        ? db.prepare("SELECT username, status FROM users WHERE id = ?").get(req.session.user.id)
        : null;
      return res.json({
        profile: readProfile(),
        canEdit: Boolean(account && account.status === 'active' && account.username &&
          account.username.toLowerCase() === profileOwnerUsername)
      });
    } catch (error) {
      return next(error);
    }
  });

  app.patch('/api/profile', (req, res, next) => {
    const accountId = req.session && req.session.user && parseId(req.session.user.id);
    if (!accountId) return res.status(401).json({ error: 'Sign in with the profile-owner account to make changes.' });
    const account = db.prepare("SELECT username, status FROM users WHERE id = ?").get(accountId);
    if (!account || account.status !== 'active' || !account.username ||
      account.username.toLowerCase() !== profileOwnerUsername) {
      return res.status(403).json({ error: 'Only the authorized profile owner can edit this profile.' });
    }
    if (!req.get('origin') || req.get('origin') !== `${req.protocol}://${req.get('host')}`) {
      return res.status(403).json({ error: 'The request origin is not allowed.' });
    }

    const body = req.body || {};
    const profile = {
      fullName: text(body.fullName),
      profileName: text(body.profileName),
      location: text(body.location),
      background: text(body.background),
      profession: text(body.profession),
      education: text(body.education),
      college: text(body.college),
      bio: text(body.bio),
      avatarUrl: text(body.avatarUrl),
      tiktokUrl: text(body.tiktokUrl),
      instagramUrl: text(body.instagramUrl),
      facebookUrl: text(body.facebookUrl),
      behanceUrl: text(body.behanceUrl),
      linkedinUrl: text(body.linkedinUrl),
      websiteUrl: text(body.websiteUrl)
    };
    const requiredLengths = [
      ['fullName', 'Full name', 2, 100],
      ['profileName', 'Profile name', 2, 100],
      ['location', 'Location', 2, 120],
      ['background', 'Background', 2, 120],
      ['profession', 'Profession', 2, 160],
      ['education', 'Education', 2, 240],
      ['college', 'College', 2, 160]
    ];
    for (const [field, label, min, max] of requiredLengths) {
      if (profile[field].length < min || profile[field].length > max) {
        return res.status(400).json({ error: `${label} must be between ${min} and ${max} characters.` });
      }
    }
    if (profile.bio.length > 2000) return res.status(400).json({ error: 'About me must be 2,000 characters or fewer.' });
    const skills = body.skills;
    if (!Array.isArray(skills) || skills.length > 20 ||
      skills.some((skill) => typeof skill !== 'string' || skill.trim().length < 2 || skill.trim().length > 50)) {
      return res.status(400).json({ error: 'Enter up to 20 skills, each between 2 and 50 characters.' });
    }
    profile.skills = [...new Set(skills.map((skill) => skill.trim()))];
    for (const field of ['avatarUrl', 'tiktokUrl', 'instagramUrl', 'facebookUrl', 'behanceUrl', 'linkedinUrl', 'websiteUrl']) {
      if (!validHttpsUrl(profile[field])) {
        return res.status(400).json({ error: 'Profile and social links must use a valid HTTPS URL.' });
      }
    }

    try {
      db.prepare(`
        UPDATE personal_profile SET
          full_name = ?, profile_name = ?, location = ?, background = ?, profession = ?,
          education = ?, college = ?, bio = ?, skills = ?, avatar_url = ?, tiktok_url = ?,
          instagram_url = ?, facebook_url = ?, behance_url = ?, linkedin_url = ?,
          website_url = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      `).run(
        profile.fullName, profile.profileName, profile.location, profile.background,
        profile.profession, profile.education, profile.college, profile.bio,
        JSON.stringify(profile.skills), profile.avatarUrl, profile.tiktokUrl,
        profile.instagramUrl, profile.facebookUrl, profile.behanceUrl,
        profile.linkedinUrl, profile.websiteUrl, accountId
      );
      logActivity(accountId, 'updated', 'personal_profile', 1);
      return res.json({ profile: readProfile(), canEdit: true });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/admissions', authRateLimit, (req, res) => {
    if (req.get('origin') && req.get('origin') !== `${req.protocol}://${req.get('host')}`) {
      return res.status(403).json({ error: 'The request origin is not allowed.' });
    }
    const fullName = text(req.body.fullName);
    const guardianName = text(req.body.guardianName);
    const phone = text(req.body.phone);
    const email = text(req.body.email).toLowerCase();
    const program = text(req.body.program);
    const message = text(req.body.message);
    if (req.body.consent !== true) return res.status(400).json({ error: 'Please confirm that the college may contact you about this inquiry.' });
    if (fullName.length < 2 || fullName.length > 100) return res.status(400).json({ error: 'Enter a name between 2 and 100 characters.' });
    if (guardianName.length > 100) return res.status(400).json({ error: 'Parent or guardian name must be 100 characters or fewer.' });
    if (phone.length < 7 || phone.length > 30 || !/^[+()\d\s.-]+$/.test(phone)) return res.status(400).json({ error: 'Enter a valid contact phone number.' });
    if (email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (program.length < 2 || program.length > 100) return res.status(400).json({ error: 'Choose a program of interest.' });
    if (message.length > 2000) return res.status(400).json({ error: 'Message must be 2,000 characters or fewer.' });
    const result = db.prepare(`
      INSERT INTO admissions (full_name, guardian_name, phone, email, program, message)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(fullName, guardianName, phone, email, program, message);
    return res.status(201).json({ success: true, reference: Number(result.lastInsertRowid) });
  });
  const credentialError = (error, res, next) => {
    if (error.message && error.message.includes('student number already exists')) {
      return fail(res, 409, 'That student roll number is already in use.');
    }
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return fail(res, 409, 'That username, email, class code, or result already exists.');
    }
    if (error.code && error.code.startsWith('SQLITE_CONSTRAINT')) {
      return fail(res, 400, 'The change conflicts with related college records.');
    }
    return next(error);
  };

  router.use((req, res, next) => {
    const sessionUser = req.session && req.session.user;
    if (!sessionUser) return fail(res, 401, 'Please sign in to continue.');
    const user = db.prepare(`
      SELECT id, full_name AS name, username, email, role, status,
             student_number AS studentNumber, phone, class_id AS classId
      FROM users WHERE id = ?
    `).get(sessionUser.id);
    if (!user || user.status !== 'active' || !roles.has(user.role)) {
      return fail(res, 401, 'Your account is unavailable. Please sign in again.');
    }
    req.user = user;
    req.session.user = { id: user.id, name: user.name, role: user.role };
    req.body = req.body || {};
    if (req.method !== 'GET' && req.get('origin')) {
      const requestOrigin = `${req.protocol}://${req.get('host')}`;
      if (req.get('origin') !== requestOrigin) return fail(res, 403, 'The request origin is not allowed.');
    }
    return next();
  });

  const allow = (...allowedRoles) => (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) return fail(res, 403, 'You do not have permission to do that.');
    return next();
  };

  const activeStudent = (id) => db.prepare(`
    SELECT id, full_name, email, username, student_number, class_id
    FROM users WHERE id = ? AND role = 'student' AND status = 'active'
  `).get(id);

  const classForTeacher = (classId, user) => {
    const classroom = db.prepare('SELECT id, teacher_id FROM classes WHERE id = ?').get(classId);
    return classroom && (user.role === 'admin' || classroom.teacher_id === user.id) ? classroom : null;
  };

  const validatedUserDetails = (body, { creating = false } = {}) => {
    const details = {
      name: text(body.fullName),
      email: text(body.email).toLowerCase(),
      username: text(body.username).toLowerCase(),
      phone: text(body.phone),
      studentNumber: text(body.studentNumber),
      classId: body.classId === '' || body.classId === null || body.classId === undefined
        ? null
        : parseId(body.classId),
      password: typeof body.password === 'string' ? body.password : ''
    };
    if (details.name.length < 2 || details.name.length > 100) return { error: 'Name must be between 2 and 100 characters.' };
    if (details.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email)) return { error: 'Enter a valid email address.' };
    if (details.username && !/^[a-z0-9._-]{3,32}$/.test(details.username)) return { error: 'Username must be 3–32 letters, numbers, dots, underscores, or hyphens.' };
    if (details.phone.length > 30 || details.studentNumber.length > 40) return { error: 'Phone or student number is too long.' };
    if (creating && (details.password.length < 10 || details.password.length > 128)) return { error: 'Password must be between 10 and 128 characters.' };
    if (!creating && details.password && (details.password.length < 10 || details.password.length > 128)) return { error: 'Password must be between 10 and 128 characters.' };
    if (body.classId && !details.classId) return { error: 'Select a valid class.' };
    return details;
  };

  router.get('/me', (req, res) => {
    res.json({ user: req.user });
  });

  router.get('/overview', allow('admin'), (req, res) => {
    const counts = db.prepare(`
      SELECT
        SUM(CASE WHEN role = 'student' AND status = 'active' THEN 1 ELSE 0 END) AS students,
        SUM(CASE WHEN role = 'teacher' AND status = 'active' THEN 1 ELSE 0 END) AS teachers,
        (SELECT COUNT(*) FROM classes) AS classes,
        (SELECT COUNT(*) FROM attendance WHERE attendance_date = date('now', 'localtime')) AS markedToday,
        (SELECT COALESCE(SUM(amount_cents - paid_cents), 0) FROM fees) AS feesOutstanding
      FROM users
    `).get();
    const attendance = db.prepare(`
      SELECT strftime('%Y-%m', attendance_date) AS month,
             ROUND(100.0 * SUM(CASE WHEN status IN ('present', 'late') THEN 1 ELSE 0 END) / COUNT(*), 1) AS rate
      FROM attendance
      WHERE attendance_date >= date('now', 'start of month', '-5 months')
      GROUP BY month ORDER BY month
    `).all();
    const recentActivity = db.prepare(`
      SELECT a.id, a.action, a.entity, a.details, a.created_at AS createdAt,
             u.full_name AS actorName
      FROM activity_log a LEFT JOIN users u ON u.id = a.actor_id
      ORDER BY a.id DESC LIMIT 8
    `).all().map((entry) => ({ ...entry, details: JSON.parse(entry.details) }));
    return res.json({ ...counts, attendance, recentActivity });
  });

  router.get('/admissions', allow('admin'), (req, res) => {
    const admissions = db.prepare(`
      SELECT id, full_name AS fullName, guardian_name AS guardianName, phone, email,
        program, message, status, created_at AS createdAt
      FROM admissions ORDER BY created_at DESC, id DESC LIMIT 500
    `).all();
    return res.json({ admissions });
  });

  router.patch('/admissions/:id/status', allow('admin'), (req, res) => {
    const id = parseId(req.params.id);
    const status = text(req.body.status);
    if (!id) return fail(res, 400, 'Choose a valid admission inquiry.');
    if (!['received', 'reviewing', 'contacted', 'accepted', 'declined'].includes(status)) {
      return fail(res, 400, 'Choose a valid admission status.');
    }
    const inquiry = db.prepare('SELECT id FROM admissions WHERE id = ?').get(id);
    if (!inquiry) return fail(res, 404, 'Admission inquiry not found.');
    db.prepare('UPDATE admissions SET status = ? WHERE id = ?').run(status, id);
    logActivity(req.user.id, 'updated', 'admission', id, { status });
    return res.json({ success: true });
  });

  router.get('/users', allow('admin'), (req, res) => {
    const role = text(req.query.role);
    if (role && !['student', 'teacher'].includes(role)) return fail(res, 400, 'Choose students or teachers.');
    const params = role ? [role] : [];
    const users = db.prepare(`
      SELECT u.id, u.full_name AS name, u.username, u.email, u.role, u.status,
             u.student_number AS studentNumber, u.phone, u.class_id AS classId,
             c.name AS className, u.created_at AS createdAt
      FROM users u LEFT JOIN classes c ON c.id = u.class_id
      WHERE u.role IN ('student', 'teacher') ${role ? 'AND u.role = ?' : ''}
      ORDER BY u.role, u.full_name
    `).all(...params);
    return res.json({ users });
  });

  router.post('/users', allow('admin'), asyncRoute(async (req, res) => {
    const role = text(req.body.role);
    if (!['student', 'teacher'].includes(role)) return fail(res, 400, 'Only student and teacher accounts can be created here.');
    const details = validatedUserDetails(req.body, { creating: true });
    if (details.error) return fail(res, 400, details.error);
    if (role === 'teacher' && !details.username) return fail(res, 400, 'Teacher accounts need a username for sign-in and administrator transfer.');
    if (role === 'teacher' && details.classId) return fail(res, 400, 'Assign teachers to classes in class management.');
    if (role === 'student' && details.classId && !db.prepare('SELECT id FROM classes WHERE id = ?').get(details.classId)) {
      return fail(res, 400, 'The selected class does not exist.');
    }
    const salt = crypto.randomBytes(16);
    const hash = await scrypt(details.password, salt, passwordKeyLength);
    try {
      const result = db.prepare(`
        INSERT INTO users (full_name, username, email, role, password_hash, password_salt, phone, student_number, class_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        details.name, details.username || null, details.email, role, hash.toString('hex'),
        salt.toString('hex'), details.phone || null, role === 'student' ? details.studentNumber || null : null,
        role === 'student' ? details.classId : null
      );
      logActivity(req.user.id, 'created', role, result.lastInsertRowid, { name: details.name });
      return res.status(201).json({ id: Number(result.lastInsertRowid) });
    } catch (error) {
      return credentialError(error, res, (nextError) => { throw nextError; });
    }
  }));

  router.patch('/users/:id', allow('admin'), asyncRoute(async (req, res) => {
    const id = parseId(req.params.id);
    const user = id && db.prepare("SELECT id, role, status FROM users WHERE id = ? AND role IN ('student', 'teacher')").get(id);
    if (!user) return fail(res, 404, 'Student or teacher account not found.');
    const details = validatedUserDetails(req.body);
    if (details.error) return fail(res, 400, details.error);
    if (user.role === 'teacher' && details.classId) return fail(res, 400, 'Assign teachers to classes in class management.');
    if (user.role === 'student' && details.classId && !db.prepare('SELECT id FROM classes WHERE id = ?').get(details.classId)) {
      return fail(res, 400, 'The selected class does not exist.');
    }
    const fields = [details.name, details.username || null, details.email, details.phone || null,
      user.role === 'student' ? details.studentNumber || null : null,
      user.role === 'student' ? details.classId : null, id];
    try {
      db.prepare(`
        UPDATE users SET full_name = ?, username = ?, email = ?, phone = ?,
          student_number = ?, class_id = ? WHERE id = ?
      `).run(...fields);
      if (details.password) {
        const salt = crypto.randomBytes(16);
        const hash = await scrypt(details.password, salt, passwordKeyLength);
        db.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?')
          .run(hash.toString('hex'), salt.toString('hex'), id);
      }
      logActivity(req.user.id, 'updated', user.role, id, { name: details.name });
      return res.json({ success: true });
    } catch (error) {
      return credentialError(error, res, (nextError) => { throw nextError; });
    }
  }));

  router.patch('/users/:id/status', allow('admin'), (req, res) => {
    const id = parseId(req.params.id);
    const status = text(req.body.status);
    const target = id && db.prepare("SELECT id, role, status FROM users WHERE id = ? AND role IN ('student', 'teacher')").get(id);
    if (!target) return fail(res, 404, 'Student or teacher account not found.');
    if (!['active', 'suspended'].includes(status)) return fail(res, 400, 'Status must be active or suspended.');
    db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, id);
    if (status === 'suspended') {
      db.prepare("DELETE FROM sessions WHERE json_extract(sess, '$.user.id') = ?").run(id);
    }
    logActivity(req.user.id, status === 'active' ? 'reactivated' : 'suspended', target.role, id);
    return res.json({ success: true });
  });

  router.delete('/users/:id', allow('admin'), (req, res) => {
    const id = parseId(req.params.id);
    const target = id && db.prepare("SELECT id, role FROM users WHERE id = ? AND role IN ('student', 'teacher') AND status != 'deleted'").get(id);
    if (!target) return fail(res, 404, 'Active student or teacher account not found.');
    db.prepare("UPDATE users SET status = 'deleted', class_id = NULL WHERE id = ?").run(id);
    db.prepare("DELETE FROM sessions WHERE json_extract(sess, '$.user.id') = ?").run(id);
    logActivity(req.user.id, 'deleted', target.role, id);
    return res.json({ success: true, retainedForRecords: true });
  });

  router.get('/classes', (req, res) => {
    let query = `
      SELECT c.id, c.name, c.code, c.academic_year AS academicYear,
        c.teacher_id AS teacherId, u.full_name AS teacherName,
        (SELECT COUNT(*) FROM users s WHERE s.class_id = c.id AND s.role = 'student' AND s.status = 'active') AS studentCount
      FROM classes c LEFT JOIN users u ON u.id = c.teacher_id
    `;
    let params = [];
    if (req.user.role === 'teacher') {
      query += ' WHERE c.teacher_id = ?';
      params = [req.user.id];
    } else if (req.user.role === 'student') {
      query += ' WHERE c.id = ?';
      params = [req.user.classId || 0];
    }
    query += ' ORDER BY c.name';
    return res.json({ classes: db.prepare(query).all(...params) });
  });

  router.get('/assignments', (req, res) => {
    const classId = req.query.classId ? parseId(req.query.classId) : null;
    if (req.query.classId && !classId) return fail(res, 400, 'Choose a valid class.');
    if (req.user.role === 'student') {
      const assignments = db.prepare(`
        SELECT a.id, a.title, a.description, a.due_date AS dueDate,
          a.created_at AS createdAt, c.id AS classId, c.name AS className
        FROM assignments a JOIN classes c ON c.id = a.class_id
        WHERE a.class_id = ? ORDER BY a.due_date, a.created_at DESC LIMIT 200
      `).all(req.user.classId || 0);
      return res.json({ assignments });
    }
    if (req.user.role === 'teacher') {
      if (classId && !classForTeacher(classId, req.user)) return fail(res, 403, 'You cannot access that class.');
      const assignments = db.prepare(`
        SELECT a.id, a.title, a.description, a.due_date AS dueDate,
          a.created_at AS createdAt, c.id AS classId, c.name AS className
        FROM assignments a JOIN classes c ON c.id = a.class_id
        WHERE c.teacher_id = ? ${classId ? 'AND c.id = ?' : ''}
        ORDER BY a.due_date, a.created_at DESC LIMIT 200
      `).all(...(classId ? [req.user.id, classId] : [req.user.id]));
      return res.json({ assignments });
    }
    const assignments = db.prepare(`
      SELECT a.id, a.title, a.description, a.due_date AS dueDate,
        a.created_at AS createdAt, c.id AS classId, c.name AS className
      FROM assignments a JOIN classes c ON c.id = a.class_id
      ${classId ? 'WHERE c.id = ?' : ''}
      ORDER BY a.due_date, a.created_at DESC LIMIT 500
    `).all(...(classId ? [classId] : []));
    return res.json({ assignments });
  });

  router.post('/assignments', allow('admin', 'teacher'), (req, res) => {
    const classId = parseId(req.body.classId);
    const title = text(req.body.title);
    const description = text(req.body.description);
    const dueDate = text(req.body.dueDate);
    if (!classId || !classForTeacher(classId, req.user)) return fail(res, 403, 'You can only assign work to a class you manage.');
    if (title.length < 2 || title.length > 140) return fail(res, 400, 'Assignment title must be between 2 and 140 characters.');
    if (description.length < 2 || description.length > 5000) return fail(res, 400, 'Assignment instructions must be between 2 and 5,000 characters.');
    if (!isDate(dueDate)) return fail(res, 400, 'Choose a valid assignment due date.');
    const result = db.prepare(`
      INSERT INTO assignments (class_id, title, description, due_date, created_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(classId, title, description, dueDate, req.user.id);
    logActivity(req.user.id, 'created', 'assignment', result.lastInsertRowid, { classId, title, dueDate });
    return res.status(201).json({ id: Number(result.lastInsertRowid) });
  });

  router.patch('/assignments/:id', allow('admin', 'teacher'), (req, res) => {
    const id = parseId(req.params.id);
    const assignment = id && db.prepare('SELECT id, class_id AS classId FROM assignments WHERE id = ?').get(id);
    if (!assignment) return fail(res, 404, 'Assignment not found.');
    if (!classForTeacher(assignment.classId, req.user)) return fail(res, 403, 'You cannot edit work for that class.');
    const title = text(req.body.title);
    const description = text(req.body.description);
    const dueDate = text(req.body.dueDate);
    if (req.body.classId !== undefined && parseId(req.body.classId) !== assignment.classId) return fail(res, 400, 'Assignments cannot be moved to another class.');
    if (title.length < 2 || title.length > 140) return fail(res, 400, 'Assignment title must be between 2 and 140 characters.');
    if (description.length < 2 || description.length > 5000) return fail(res, 400, 'Assignment instructions must be between 2 and 5,000 characters.');
    if (!isDate(dueDate)) return fail(res, 400, 'Choose a valid assignment due date.');
    db.prepare('UPDATE assignments SET title = ?, description = ?, due_date = ? WHERE id = ?')
      .run(title, description, dueDate, id);
    logActivity(req.user.id, 'updated', 'assignment', id, { title, dueDate });
    return res.json({ success: true });
  });

  router.delete('/assignments/:id', allow('admin', 'teacher'), (req, res) => {
    const id = parseId(req.params.id);
    const assignment = id && db.prepare('SELECT id, class_id AS classId FROM assignments WHERE id = ?').get(id);
    if (!assignment) return fail(res, 404, 'Assignment not found.');
    if (!classForTeacher(assignment.classId, req.user)) return fail(res, 403, 'You cannot delete work for that class.');
    db.prepare('DELETE FROM assignments WHERE id = ?').run(id);
    logActivity(req.user.id, 'deleted', 'assignment', id);
    return res.json({ success: true });
  });

  const classroomDetails = (body) => {
    const name = text(body.name);
    const code = text(body.code).toUpperCase();
    const academicYear = text(body.academicYear);
    const teacherId = body.teacherId ? parseId(body.teacherId) : null;
    if (name.length < 2 || name.length > 100 || !/^[A-Z0-9-]{2,20}$/.test(code)) {
      return { error: 'Enter a class name and a code of 2–20 letters, numbers, or hyphens.' };
    }
    if (academicYear.length > 30) return { error: 'Academic year is too long.' };
    if (body.teacherId && (!teacherId || !db.prepare("SELECT id FROM users WHERE id = ? AND role = 'teacher' AND status = 'active'").get(teacherId))) {
      return { error: 'Select an active teacher account.' };
    }
    return { name, code, academicYear, teacherId };
  };

  router.post('/classes', allow('admin'), (req, res) => {
    const details = classroomDetails(req.body);
    if (details.error) return fail(res, 400, details.error);
    try {
      const result = db.prepare('INSERT INTO classes (name, code, academic_year, teacher_id) VALUES (?, ?, ?, ?)')
        .run(details.name, details.code, details.academicYear, details.teacherId);
      logActivity(req.user.id, 'created', 'class', result.lastInsertRowid, { name: details.name });
      return res.status(201).json({ id: Number(result.lastInsertRowid) });
    } catch (error) {
      return credentialError(error, res, (nextError) => { throw nextError; });
    }
  });

  router.patch('/classes/:id', allow('admin'), (req, res) => {
    const id = parseId(req.params.id);
    if (!id || !db.prepare('SELECT id FROM classes WHERE id = ?').get(id)) return fail(res, 404, 'Class not found.');
    const details = classroomDetails(req.body);
    if (details.error) return fail(res, 400, details.error);
    try {
      db.prepare('UPDATE classes SET name = ?, code = ?, academic_year = ?, teacher_id = ? WHERE id = ?')
        .run(details.name, details.code, details.academicYear, details.teacherId, id);
      logActivity(req.user.id, 'updated', 'class', id, { name: details.name });
      return res.json({ success: true });
    } catch (error) {
      return credentialError(error, res, (nextError) => { throw nextError; });
    }
  });

  router.delete('/classes/:id', allow('admin'), (req, res) => {
    const id = parseId(req.params.id);
    if (!id || !db.prepare('SELECT id FROM classes WHERE id = ?').get(id)) return fail(res, 404, 'Class not found.');
    const hasRecords = db.prepare(`
      SELECT EXISTS(SELECT 1 FROM users WHERE class_id = ?) OR
             EXISTS(SELECT 1 FROM timetable WHERE class_id = ?) OR
             EXISTS(SELECT 1 FROM attendance WHERE class_id = ?)
    `).get(id, id, id);
    if (Object.values(hasRecords).some(Boolean)) return fail(res, 409, 'This class has students or historical records. Reassign them before deleting it.');
    db.prepare('DELETE FROM classes WHERE id = ?').run(id);
    logActivity(req.user.id, 'deleted', 'class', id);
    return res.json({ success: true });
  });

  router.get('/attendance', (req, res) => {
    if (req.query.date !== undefined && !isDate(req.query.date)) return fail(res, 400, 'Choose a valid attendance date.');
    if (req.query.classId !== undefined && !parseId(req.query.classId)) return fail(res, 400, 'Choose a valid class.');
    const search = text(req.query.search);
    if (search.length > 100) return fail(res, 400, 'Search text must be 100 characters or fewer.');
    const date = isDate(req.query.date) ? req.query.date : new Date().toISOString().slice(0, 10);
    const classId = req.query.classId ? parseId(req.query.classId) : null;
    if (req.user.role === 'student') {
      const records = db.prepare(`
        SELECT a.id, a.attendance_date AS date, a.status, c.name AS className
        FROM attendance a JOIN classes c ON c.id = a.class_id
        WHERE a.student_id = ? ORDER BY a.attendance_date DESC LIMIT 120
      `).all(req.user.id);
      return res.json({ records });
    }
    if (req.user.role === 'teacher' && !classId) return fail(res, 400, 'Choose one of your classes.');
    if (classId && !classForTeacher(classId, req.user)) return fail(res, 403, 'You cannot access that class.');
    if (classId) {
      const roster = db.prepare(`
        SELECT u.id AS studentId, u.full_name AS name, u.student_number AS studentNumber,
          a.status, ? AS date, ? AS classId
        FROM users u LEFT JOIN attendance a
          ON a.student_id = u.id AND a.attendance_date = ?
        WHERE u.role = 'student' AND u.status = 'active' AND u.class_id = ?
          AND (? = '' OR instr(lower(u.full_name), lower(?)) > 0
            OR instr(lower(COALESCE(u.student_number, '')), lower(?)) > 0)
        ORDER BY u.full_name
      `).all(date, classId, date, classId, search, search, search);
      return res.json({ date, records: roster });
    }
    let sql = `
      SELECT a.student_id AS studentId, u.full_name AS name, u.student_number AS studentNumber,
        a.status, a.attendance_date AS date, a.class_id AS classId
      FROM attendance a JOIN users u ON u.id = a.student_id
      WHERE a.attendance_date = ?
    `;
    const params = [date];
    if (search) {
      sql += ` AND (instr(lower(u.full_name), lower(?)) > 0
        OR instr(lower(COALESCE(u.student_number, '')), lower(?)) > 0)`;
      params.push(search, search);
    }
    sql += ' ORDER BY u.full_name';
    const records = db.prepare(sql).all(...params);
    return res.json({ date, records });
  });

  router.post('/attendance', allow('admin', 'teacher'), (req, res) => {
    const date = text(req.body.date);
    const classId = parseId(req.body.classId);
    const entries = req.body.entries;
    if (!isDate(date) || date > new Date().toISOString().slice(0, 10)) return fail(res, 400, 'Choose a valid attendance date no later than today.');
    if (!classId || !classForTeacher(classId, req.user)) return fail(res, 403, 'You cannot mark attendance for that class.');
    if (!Array.isArray(entries) || entries.length < 1 || entries.length > 500) return fail(res, 400, 'Submit between 1 and 500 attendance entries.');
    const students = new Set(db.prepare(`
      SELECT id FROM users WHERE role = 'student' AND status = 'active' AND class_id = ?
    `).all(classId).map((row) => row.id));
    const uniqueIds = new Set();
    for (const entry of entries) {
      const studentId = parseId(entry && entry.studentId);
      if (!studentId || !students.has(studentId) || uniqueIds.has(studentId) || !attendanceStatuses.has(entry.status)) {
        return fail(res, 400, 'Each entry must belong to a unique active student in this class and use Present, Absent, or Late.');
      }
      uniqueIds.add(studentId);
    }
    const mark = db.prepare(`
      INSERT INTO attendance (student_id, class_id, attendance_date, status, marked_by)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(student_id, attendance_date) DO UPDATE SET
        class_id = excluded.class_id, status = excluded.status,
        marked_by = excluded.marked_by, updated_at = CURRENT_TIMESTAMP
    `);
    const saveEntries = db.transaction((rows) => {
      for (const row of rows) mark.run(row.studentId, classId, date, row.status, req.user.id);
    });
    saveEntries(entries);
    logActivity(req.user.id, 'marked', 'attendance', null, { classId, date, count: entries.length });
    return res.json({ saved: entries.length });
  });

  router.get('/attendance/reports', allow('admin', 'teacher'), (req, res) => {
    const month = text(req.query.month);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return fail(res, 400, 'Choose a valid month.');
    const search = text(req.query.search);
    if (search.length > 100) return fail(res, 400, 'Search text must be 100 characters or fewer.');
    const classId = req.query.classId ? parseId(req.query.classId) : null;
    if (classId && !classForTeacher(classId, req.user)) return fail(res, 403, 'You cannot access that class.');
    const conditions = ["strftime('%Y-%m', a.attendance_date) = ?"];
    const params = [month];
    if (classId) {
      conditions.push('a.class_id = ?');
      params.push(classId);
    } else if (req.user.role === 'teacher') {
      conditions.push('c.teacher_id = ?');
      params.push(req.user.id);
    }
    if (search) {
      conditions.push(`(instr(lower(u.full_name), lower(?)) > 0
        OR instr(lower(COALESCE(u.student_number, '')), lower(?)) > 0)`);
      params.push(search, search);
    }
    const where = conditions.join(' AND ');
    const rows = db.prepare(`
      SELECT a.student_id AS studentId, u.full_name AS studentName,
        c.id AS classId, c.name AS className, COUNT(*) AS recordedDays,
        SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) AS present,
        SUM(CASE WHEN a.status = 'late' THEN 1 ELSE 0 END) AS late,
        SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) AS absent,
        ROUND(100.0 * SUM(CASE WHEN a.status IN ('present', 'late') THEN 1 ELSE 0 END) / COUNT(*), 1) AS rate
      FROM attendance a
      JOIN users u ON u.id = a.student_id
      JOIN classes c ON c.id = a.class_id
      WHERE ${where}
      GROUP BY a.class_id, a.student_id
      ORDER BY c.name, u.full_name
    `).all(...params);
    const summary = rows.reduce((result, row) => {
      result.recordedDays += Number(row.recordedDays);
      result.present += Number(row.present);
      result.late += Number(row.late);
      result.absent += Number(row.absent);
      return result;
    }, { recordedDays: 0, present: 0, late: 0, absent: 0 });
    return res.json({ month, summary, rows });
  });

  router.get('/fees', (req, res) => {
    const studentId = req.user.role === 'admin'
      ? (req.query.studentId ? parseId(req.query.studentId) : null)
      : req.user.id;
    if (req.user.role === 'teacher') return fail(res, 403, 'Fee records are private to students and administrators.');
    const where = studentId ? 'WHERE f.student_id = ?' : '';
    const params = studentId ? [studentId] : [];
    const fees = db.prepare(`
      SELECT f.id, f.student_id AS studentId, u.full_name AS studentName,
        f.label, f.amount_cents AS amountCents, f.paid_cents AS paidCents,
        f.due_date AS dueDate, f.created_at AS createdAt
      FROM fees f JOIN users u ON u.id = f.student_id ${where}
      ORDER BY f.due_date DESC, u.full_name
    `).all(...params).map((fee) => ({
      ...fee,
      balanceCents: fee.amountCents - fee.paidCents,
      status: fee.paidCents === 0 ? 'unpaid' : fee.paidCents >= fee.amountCents ? 'paid' : 'partial'
    }));
    return res.json({ fees });
  });

  router.post('/fees', allow('admin'), (req, res) => {
    const studentId = parseId(req.body.studentId);
    const label = text(req.body.label);
    const amountCents = Math.round(Number(req.body.amount) * 100);
    const dueDate = text(req.body.dueDate);
    if (!studentId || !activeStudent(studentId)) return fail(res, 400, 'Select an active student.');
    if (label.length < 2 || label.length > 100) return fail(res, 400, 'Fee description must be between 2 and 100 characters.');
    if (!Number.isSafeInteger(amountCents) || amountCents < 1 || amountCents > 10000000000) return fail(res, 400, 'Enter a valid fee amount.');
    if (!isDate(dueDate)) return fail(res, 400, 'Enter a valid due date.');
    const result = db.prepare(`
      INSERT INTO fees (student_id, label, amount_cents, due_date, created_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(studentId, label, amountCents, dueDate, req.user.id);
    logActivity(req.user.id, 'created', 'fee', result.lastInsertRowid, { studentId, label });
    return res.status(201).json({ id: Number(result.lastInsertRowid) });
  });

  router.patch('/fees/:id', allow('admin'), (req, res) => {
    const id = parseId(req.params.id);
    const amountCents = Math.round(Number(req.body.amount) * 100);
    const paidCents = Math.round(Number(req.body.paidAmount) * 100);
    const label = text(req.body.label);
    const dueDate = text(req.body.dueDate);
    const fee = id && db.prepare('SELECT id FROM fees WHERE id = ?').get(id);
    if (!fee) return fail(res, 404, 'Fee record not found.');
    if (label.length < 2 || label.length > 100) return fail(res, 400, 'Fee description must be between 2 and 100 characters.');
    if (!Number.isSafeInteger(amountCents) || amountCents < 1 || amountCents > 10000000000) return fail(res, 400, 'Enter a valid fee amount.');
    if (!Number.isSafeInteger(paidCents) || paidCents < 0 || paidCents > amountCents) return fail(res, 400, 'Paid amount must be between zero and the total fee.');
    if (!isDate(dueDate)) return fail(res, 400, 'Enter a valid due date.');
    db.prepare('UPDATE fees SET label = ?, amount_cents = ?, paid_cents = ?, due_date = ? WHERE id = ?')
      .run(label, amountCents, paidCents, dueDate, id);
    logActivity(req.user.id, 'updated', 'fee', id, { paidCents });
    return res.json({ success: true });
  });

  router.get('/results', (req, res) => {
    if (req.user.role === 'teacher') {
      const classId = req.query.classId ? parseId(req.query.classId) : null;
      if (req.query.classId && !classId) return fail(res, 400, 'Choose a valid class.');
      if (classId && !classForTeacher(classId, req.user)) return fail(res, 403, 'You cannot access that class.');
      const results = db.prepare(`
        SELECT r.id, r.student_id AS studentId, u.full_name AS studentName,
          u.student_number AS studentNumber, r.exam_name AS examName, r.subject,
          r.score, r.maximum_score AS maximumScore,
          ROUND(100.0 * r.score / r.maximum_score, 1) AS percentage,
          r.published_at AS publishedAt, c.id AS classId, c.name AS className
        FROM results r JOIN users u ON u.id = r.student_id
        JOIN classes c ON c.id = u.class_id
        WHERE c.teacher_id = ? ${classId ? 'AND c.id = ?' : ''}
        ORDER BY r.published_at DESC, u.full_name, r.subject
      `).all(...(classId ? [req.user.id, classId] : [req.user.id]));
      return res.json({ results });
    }
    const studentId = req.user.role === 'admin'
      ? (req.query.studentId ? parseId(req.query.studentId) : null)
      : req.user.id;
    const where = studentId ? 'WHERE r.student_id = ?' : '';
    const params = studentId ? [studentId] : [];
    const results = db.prepare(`
      SELECT r.id, r.student_id AS studentId, u.full_name AS studentName,
        r.exam_name AS examName, r.subject, r.score, r.maximum_score AS maximumScore,
        ROUND(100.0 * r.score / r.maximum_score, 1) AS percentage,
        r.published_at AS publishedAt
      FROM results r JOIN users u ON u.id = r.student_id ${where}
      ORDER BY r.published_at DESC, u.full_name, r.subject
    `).all(...params);
    return res.json({ results });
  });

  router.post('/results', allow('admin', 'teacher'), (req, res) => {
    const studentId = parseId(req.body.studentId);
    const examName = text(req.body.examName);
    const subject = text(req.body.subject);
    const score = Number(req.body.score);
    const maximumScore = Number(req.body.maximumScore);
    const student = studentId && activeStudent(studentId);
    if (!student) return fail(res, 400, 'Select an active student.');
    if (req.user.role === 'teacher' && !classForTeacher(student.class_id, req.user)) {
      return fail(res, 403, 'You can only publish marks for a student in a class you manage.');
    }
    if (examName.length < 2 || examName.length > 100 || subject.length < 2 || subject.length > 100) return fail(res, 400, 'Exam and subject names must be between 2 and 100 characters.');
    if (!Number.isFinite(score) || !Number.isFinite(maximumScore) || maximumScore <= 0 || score < 0 || score > maximumScore || maximumScore > 100000) {
      return fail(res, 400, 'Enter valid exam marks; the score cannot exceed the maximum.');
    }
    try {
      const result = db.prepare(`
        INSERT INTO results (student_id, exam_name, subject, score, maximum_score, created_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(studentId, examName, subject, score, maximumScore, req.user.id);
      logActivity(req.user.id, 'published', 'result', result.lastInsertRowid, { studentId, examName, subject });
      return res.status(201).json({ id: Number(result.lastInsertRowid) });
    } catch (error) {
      return credentialError(error, res, (nextError) => { throw nextError; });
    }
  });

  router.patch('/results/:id', allow('admin', 'teacher'), (req, res) => {
    const id = parseId(req.params.id);
    const result = id && db.prepare(`
      SELECT r.id, u.class_id AS classId
      FROM results r JOIN users u ON u.id = r.student_id
      WHERE r.id = ?
    `).get(id);
    if (!result) return fail(res, 404, 'Exam result not found.');
    if (req.user.role === 'teacher' && !classForTeacher(result.classId, req.user)) {
      return fail(res, 403, 'You can only update marks for a student in a class you manage.');
    }
    const score = Number(req.body.score);
    const maximumScore = Number(req.body.maximumScore);
    if (!Number.isFinite(score) || !Number.isFinite(maximumScore) || maximumScore <= 0 || score < 0 || score > maximumScore || maximumScore > 100000) {
      return fail(res, 400, 'Enter valid exam marks; the score cannot exceed the maximum.');
    }
    db.prepare('UPDATE results SET score = ?, maximum_score = ? WHERE id = ?').run(score, maximumScore, id);
    logActivity(req.user.id, 'updated', 'result', id, { score, maximumScore });
    return res.json({ success: true });
  });

  router.get('/notices', (req, res) => {
    const notices = req.user.role === 'admin'
      ? db.prepare('SELECT id, title, body, audience, created_at AS createdAt FROM notices ORDER BY id DESC LIMIT 100').all()
      : db.prepare(`
        SELECT id, title, body, audience, created_at AS createdAt FROM notices
        WHERE audience IN ('all', ?) ORDER BY id DESC LIMIT 100
      `).all(req.user.role);
    return res.json({ notices });
  });

  router.post('/notices', allow('admin'), (req, res) => {
    const details = noticeDetails(req.body);
    if (details.error) return fail(res, 400, details.error);
    const result = db.prepare('INSERT INTO notices (title, body, audience, created_by) VALUES (?, ?, ?, ?)')
      .run(details.title, details.body, details.audience, req.user.id);
    logActivity(req.user.id, 'published', 'notice', result.lastInsertRowid, { title: details.title, audience: details.audience });
    return res.status(201).json({ id: Number(result.lastInsertRowid) });
  });

  const noticeDetails = (body) => {
    const title = text(body.title);
    const noticeBody = text(body.body);
    const audience = text(body.audience);
    if (title.length < 2 || title.length > 140 || noticeBody.length < 2 || noticeBody.length > 5000) {
      return { error: 'Notice title or message length is invalid.' };
    }
    if (!noticeAudiences.has(audience)) return { error: 'Choose an audience of everyone, students, or teachers.' };
    return { title, body: noticeBody, audience };
  };

  router.patch('/notices/:id', allow('admin'), (req, res) => {
    const id = parseId(req.params.id);
    if (!id || !db.prepare('SELECT id FROM notices WHERE id = ?').get(id)) return fail(res, 404, 'Notice not found.');
    const details = noticeDetails(req.body);
    if (details.error) return fail(res, 400, details.error);
    db.prepare('UPDATE notices SET title = ?, body = ?, audience = ? WHERE id = ?')
      .run(details.title, details.body, details.audience, id);
    logActivity(req.user.id, 'updated', 'notice', id, { title: details.title, audience: details.audience });
    return res.json({ success: true });
  });

  router.delete('/notices/:id', allow('admin'), (req, res) => {
    const id = parseId(req.params.id);
    const notice = id && db.prepare('SELECT id, title FROM notices WHERE id = ?').get(id);
    if (!notice) return fail(res, 404, 'Notice not found.');
    db.prepare('DELETE FROM notices WHERE id = ?').run(id);
    logActivity(req.user.id, 'deleted', 'notice', id, { title: notice.title });
    return res.json({ success: true });
  });

  router.get('/settings', (req, res) => {
    const settings = Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map((entry) => [entry.key, entry.value]));
    return res.json({ settings });
  });

  router.put('/settings', allow('admin'), (req, res) => {
    const allowedKeys = ['college_name', 'academic_year', 'term', 'currency'];
    const entries = allowedKeys.map((key) => [key, text(req.body[key])]);
    if (entries.some(([key, value]) => value.length < 1 || value.length > (key === 'college_name' ? 120 : 40))) {
      return fail(res, 400, 'Complete all settings fields with valid values.');
    }
    const save = db.transaction((values) => {
      for (const [key, value] of values) {
        db.prepare(`
          INSERT INTO settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP
        `).run(key, value, req.user.id);
      }
    });
    save(entries);
    logActivity(req.user.id, 'updated', 'settings', null);
    return res.json({ settings: Object.fromEntries(entries) });
  });

  router.get('/timetable', (req, res) => {
    let where = '';
    let params = [];
    if (req.user.role === 'student') {
      where = 'WHERE t.class_id = ?';
      params = [req.user.classId || 0];
    } else if (req.user.role === 'teacher') {
      where = 'WHERE c.teacher_id = ?';
      params = [req.user.id];
    } else if (req.query.classId) {
      const classId = parseId(req.query.classId);
      if (!classId) return fail(res, 400, 'Select a valid class.');
      where = 'WHERE t.class_id = ?';
      params = [classId];
    }
    const timetable = db.prepare(`
      SELECT t.id, t.class_id AS classId, c.name AS className,
        t.weekday, t.start_time AS startTime, t.end_time AS endTime,
        t.subject, t.room
      FROM timetable t JOIN classes c ON c.id = t.class_id ${where}
      ORDER BY t.weekday, t.start_time
    `).all(...params);
    return res.json({ timetable });
  });

  const timetableDetails = (body) => {
    const classId = parseId(body.classId);
    const weekday = Number(body.weekday);
    const startTime = text(body.startTime);
    const endTime = text(body.endTime);
    const subject = text(body.subject);
    const room = text(body.room);
    if (!classId || !db.prepare('SELECT id FROM classes WHERE id = ?').get(classId)) return { error: 'Select an existing class.' };
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) return { error: 'Choose a valid weekday.' };
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) || startTime >= endTime) return { error: 'Enter a valid start and end time.' };
    if (subject.length < 2 || subject.length > 100 || room.length > 50) return { error: 'Enter a valid subject and room.' };
    return { classId, weekday, startTime, endTime, subject, room };
  };

  router.post('/timetable', allow('admin'), (req, res) => {
    const details = timetableDetails(req.body);
    if (details.error) return fail(res, 400, details.error);
    const result = db.prepare(`
      INSERT INTO timetable (class_id, weekday, start_time, end_time, subject, room)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(details.classId, details.weekday, details.startTime, details.endTime, details.subject, details.room);
    logActivity(req.user.id, 'created', 'timetable', result.lastInsertRowid, { classId: details.classId, subject: details.subject });
    return res.status(201).json({ id: Number(result.lastInsertRowid) });
  });

  router.patch('/timetable/:id', allow('admin'), (req, res) => {
    const id = parseId(req.params.id);
    if (!id || !db.prepare('SELECT id FROM timetable WHERE id = ?').get(id)) return fail(res, 404, 'Timetable entry not found.');
    const details = timetableDetails(req.body);
    if (details.error) return fail(res, 400, details.error);
    db.prepare(`
      UPDATE timetable SET class_id = ?, weekday = ?, start_time = ?,
        end_time = ?, subject = ?, room = ? WHERE id = ?
    `).run(details.classId, details.weekday, details.startTime, details.endTime, details.subject, details.room, id);
    logActivity(req.user.id, 'updated', 'timetable', id, { classId: details.classId, subject: details.subject });
    return res.json({ success: true });
  });

  router.delete('/timetable/:id', allow('admin'), (req, res) => {
    const id = parseId(req.params.id);
    if (!id || !db.prepare('SELECT id FROM timetable WHERE id = ?').get(id)) return fail(res, 404, 'Timetable entry not found.');
    db.prepare('DELETE FROM timetable WHERE id = ?').run(id);
    logActivity(req.user.id, 'deleted', 'timetable', id);
    return res.json({ success: true });
  });

  router.get('/activity', allow('admin'), (req, res) => {
    const logs = db.prepare(`
      SELECT a.id, a.action, a.entity, a.entity_id AS entityId,
        a.details, a.created_at AS createdAt, u.full_name AS actorName
      FROM activity_log a LEFT JOIN users u ON u.id = a.actor_id
      ORDER BY a.id DESC LIMIT 100
    `).all().map((entry) => ({ ...entry, details: JSON.parse(entry.details) }));
    return res.json({ logs });
  });

  router.post('/transfer-admin', authRateLimit, allow('admin'), asyncRoute(async (req, res) => {
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const targetUsername = text(req.body.targetUsername).toLowerCase();
    if (text(req.body.confirmation) !== transferConfirmation) return fail(res, 400, `Type "${transferConfirmation}" to confirm.`);
    if (!password || password.length > 128) return fail(res, 400, 'Enter your current password.');
    if (!/^[a-z0-9._-]{3,32}$/.test(targetUsername)) return fail(res, 400, 'Enter the authorized teacher username.');
    const current = db.prepare('SELECT id, password_hash, password_salt FROM users WHERE id = ?').get(req.user.id);
    const expected = Buffer.from(current.password_hash, 'hex');
    const actual = await scrypt(password, Buffer.from(current.password_salt, 'hex'), expected.length);
    if (!crypto.timingSafeEqual(expected, actual)) return fail(res, 401, 'Your password is incorrect. Ownership was not changed.');
    const target = db.prepare(`
      SELECT id, full_name, username FROM users
      WHERE username = ? COLLATE NOCASE AND role = 'teacher' AND status = 'active'
    `).get(targetUsername);
    if (!target || target.id === req.user.id) return fail(res, 404, 'An active authorized teacher account with that username was not found.');
    const transfer = db.transaction(() => {
      db.prepare("UPDATE users SET role = 'teacher' WHERE id = ?").run(req.user.id);
      db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(target.id);
      logActivity(req.user.id, 'transferred administration to', 'admin_ownership', target.id, {
        fromUserId: req.user.id,
        toUserId: target.id,
        toUsername: target.username,
        toName: target.full_name
      });
    });
    transfer();
    req.session.user = { id: req.user.id, name: req.user.name, role: 'teacher' };
    return req.session.save((error) => {
      if (error) return fail(res, 500, 'Ownership transferred, but the session could not be refreshed. Sign in again.');
      return res.json({ success: true, newAdmin: { name: target.full_name, username: target.username } });
    });
  }));

  router.get('/portal', allow('student'), (req, res) => {
    const profile = db.prepare(`
      SELECT u.id, u.full_name AS name, u.username, u.email, u.phone,
        u.student_number AS studentNumber, c.name AS className, c.code AS classCode
      FROM users u LEFT JOIN classes c ON c.id = u.class_id WHERE u.id = ?
    `).get(req.user.id);
    const attendance = db.prepare(`
      SELECT attendance_date AS date, status FROM attendance
      WHERE student_id = ? ORDER BY attendance_date DESC LIMIT 120
    `).all(req.user.id);
    const attendanceSummary = db.prepare(`
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN status IN ('present', 'late') THEN 1 ELSE 0 END) AS attended,
        SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) AS late
      FROM attendance WHERE student_id = ?
    `).get(req.user.id);
    const fees = db.prepare(`
      SELECT id, label, amount_cents AS amountCents, paid_cents AS paidCents,
        due_date AS dueDate
      FROM fees WHERE student_id = ? ORDER BY due_date
    `).all(req.user.id).map((fee) => ({
      ...fee, balanceCents: fee.amountCents - fee.paidCents,
      status: fee.paidCents === 0 ? 'unpaid' : fee.paidCents >= fee.amountCents ? 'paid' : 'partial'
    }));
    const results = db.prepare(`
      SELECT id, exam_name AS examName, subject, score, maximum_score AS maximumScore,
        ROUND(100.0 * score / maximum_score, 1) AS percentage,
        published_at AS publishedAt
      FROM results WHERE student_id = ? ORDER BY published_at DESC
    `).all(req.user.id);
    const timetable = db.prepare(`
      SELECT t.id, c.name AS className, t.weekday, t.start_time AS startTime,
        t.end_time AS endTime, t.subject, t.room
      FROM timetable t JOIN classes c ON c.id = t.class_id
      WHERE t.class_id = ? ORDER BY t.weekday, t.start_time
    `).all(req.user.classId || 0);
    const assignments = db.prepare(`
      SELECT id, title, description, due_date AS dueDate, created_at AS createdAt
      FROM assignments WHERE class_id = ? ORDER BY due_date, created_at DESC LIMIT 100
    `).all(req.user.classId || 0);
    const notices = db.prepare(`
      SELECT id, title, body, audience, created_at AS createdAt FROM notices
      WHERE audience IN ('all', 'student') ORDER BY id DESC LIMIT 30
    `).all();
    const settings = Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map((item) => [item.key, item.value]));
    return res.json({ profile, attendance, attendanceSummary, fees, results, timetable, assignments, notices, settings });
  });

  app.use('/api/management', router);
};
