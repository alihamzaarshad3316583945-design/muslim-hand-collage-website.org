const menuBtn = document.querySelector('.menu-btn');
const nav = document.querySelector('.navlinks');

const setMenuState = (isOpen) => {
  if (!menuBtn || !nav) return;
  nav.classList.toggle('open', isOpen);
  menuBtn.setAttribute('aria-expanded', String(isOpen));
  menuBtn.setAttribute('aria-label', isOpen ? 'Close navigation menu' : 'Open navigation menu');
  menuBtn.textContent = isOpen ? '✕ Close' : '☰ Menu';
};

if (menuBtn && nav) {
  menuBtn.addEventListener('click', () => {
    const isOpen = !nav.classList.contains('open');
    setMenuState(isOpen);
  });

  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => setMenuState(false));
  });

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!nav.contains(target) && !menuBtn.contains(target)) {
      setMenuState(false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && nav.classList.contains('open')) {
      setMenuState(false);
      menuBtn.focus();
    }
  });
}

const themeKey = 'mh-college-theme';
let activeTheme = 'dark';
try {
  const savedTheme = window.localStorage.getItem(themeKey);
  if (savedTheme === 'light' || savedTheme === 'dark') activeTheme = savedTheme;
} catch (error) {
  activeTheme = 'dark';
}
document.body.dataset.theme = activeTheme;

const mainContent = document.querySelector('main');
if (mainContent) {
  mainContent.id = mainContent.id || 'main-content';
  const skipLink = document.createElement('a');
  skipLink.className = 'skip-link';
  skipLink.href = `#${mainContent.id}`;
  skipLink.textContent = 'Skip to main content';
  document.body.insertBefore(skipLink, document.body.firstChild);
}

document.querySelectorAll('img').forEach((image) => {
  if (!image.hasAttribute('decoding')) image.setAttribute('decoding', 'async');
  if (image.matches('.hero-art img, .page-hero-visual img')) image.setAttribute('fetchpriority', 'high');
});

if (nav) {
  nav.setAttribute('aria-label', 'Main navigation');
  nav.id = nav.id || 'primary-navigation';
  const aboutLink = nav.querySelector('a[href="about.html"]');
  const contactLink = nav.querySelector('a[href="contact.html"]');
  if (aboutLink) aboutLink.textContent = 'About College';
  if (contactLink) contactLink.textContent = 'Contact Us';
  const activeLink = nav.querySelector('a.active');
  if (activeLink) activeLink.setAttribute('aria-current', 'page');
}
if (menuBtn) {
  menuBtn.setAttribute('aria-label', 'Open navigation menu');
  menuBtn.setAttribute('aria-controls', nav ? nav.id : 'primary-navigation');
}

const themeMeta = document.querySelector('meta[name="theme-color"]') || document.head.appendChild(Object.assign(document.createElement('meta'), { name: 'theme-color' }));
const searchShortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K';
const headerUtilities = document.createElement('div');
headerUtilities.className = 'nav-utilities';
headerUtilities.innerHTML = `
  <a class="profile-nav-link" href="profile.html" aria-label="View Ali Kashmiri's profile">
    <span class="profile-nav-avatar" data-profile-nav-avatar aria-hidden="true">AK</span><span data-profile-nav-name>Ali Kashmiri</span>
  </a>
  <a class="header-action auth-link" href="login.html"><span>Sign in</span></a>
  <a class="header-action signup-link" href="signup.html"><span>Sign up</span></a>
  <details class="nav-portal-menu">
    <summary class="header-action">Portals <span aria-hidden="true">⌄</span></summary>
    <div class="portal-menu-list">
      <a href="student.html#student-attendance">Student attendance</a>
      <a href="student.html">Student dashboard</a>
      <a href="teacher.html">Teacher dashboard</a>
      <a href="admin.html">Admin dashboard</a>
    </div>
  </details>
  <button class="header-action search-trigger" type="button" aria-haspopup="dialog" aria-expanded="false">
    <span aria-hidden="true">⌕</span><span>Search</span><kbd>${searchShortcut}</kbd>
  </button>
  <button class="header-action theme-toggle" type="button">
    <span class="theme-icon" aria-hidden="true"></span><span class="theme-label"></span>
  </button>
`;
if (nav) nav.appendChild(headerUtilities);

if (nav && window.location.protocol !== 'file:') {
  const profileName = headerUtilities.querySelector('[data-profile-nav-name]');
  const profileAvatar = headerUtilities.querySelector('[data-profile-nav-avatar]');
  fetch('/api/profile', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
    .then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load profile navigation details.');
      if (!data.profile || typeof data.profile.profileName !== 'string') {
        throw new Error('The profile navigation response is incomplete.');
      }
      return data.profile;
    })
    .then((profile) => {
      profileName.textContent = profile.profileName;
      headerUtilities.querySelector('.profile-nav-link')
        .setAttribute('aria-label', `View ${profile.profileName}'s profile`);
      const initials = profile.profileName.trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase();
      profileAvatar.textContent = initials || 'AK';
      if (profile.avatarUrl) {
        const image = document.createElement('img');
        image.src = profile.avatarUrl;
        image.alt = '';
        image.referrerPolicy = 'no-referrer';
        image.addEventListener('error', () => { profileAvatar.textContent = initials || 'AK'; });
        profileAvatar.replaceChildren(image);
      }
    })
    .catch((error) => console.error('Profile navigation could not be updated:', error));
}

const searchTrigger = headerUtilities.querySelector('.search-trigger');
const themeToggle = headerUtilities.querySelector('.theme-toggle');
const updateThemeControl = () => {
  const nextTheme = activeTheme === 'dark' ? 'light' : 'dark';
  themeToggle.setAttribute('aria-label', `Switch to ${nextTheme} mode`);
  themeToggle.setAttribute('aria-pressed', String(activeTheme === 'light'));
  themeToggle.querySelector('.theme-icon').textContent = activeTheme === 'dark' ? '☼' : '☾';
  themeToggle.querySelector('.theme-label').textContent = `${nextTheme[0].toUpperCase()}${nextTheme.slice(1)} mode`;
  themeMeta.content = activeTheme === 'dark' ? '#090a0d' : '#f7f5ef';
};
updateThemeControl();

themeToggle.addEventListener('click', () => {
  activeTheme = activeTheme === 'dark' ? 'light' : 'dark';
  document.body.dataset.theme = activeTheme;
  updateThemeControl();
  try {
    window.localStorage.setItem(themeKey, activeTheme);
  } catch (error) {
    // Keep the selected theme for this page even when storage is unavailable.
  }
});

const searchPages = [
  { url: 'index.html', title: 'Home', description: 'Learn with purpose and lead with confidence.', keywords: 'welcome college excellence campus vision learning' },
  { url: 'about.html', title: 'About Us', description: 'Our purpose, vision, values, and commitment to student success.', keywords: 'mission history values purpose vision about college' },
  { url: 'admissions.html', title: 'Admissions', description: 'Admission steps, application preparation, eligibility, and documents.', keywords: 'admission apply application eligibility documents dates process' },
  { url: 'apply.html', title: 'Online Admission', description: 'Send a private admission inquiry to the college team.', keywords: 'apply online admission enquiry form student phone email program' },
  { url: 'programs.html', title: 'Programs', description: 'Explore sample academic pathways and study options.', keywords: 'program academic pathways science arts commerce subjects' },
  { url: 'courses.html', title: 'Courses', description: 'Browse sample course areas, skills, and study guidance.', keywords: 'course subjects computer studies humanities science skills' },
  { url: 'faculty.html', title: 'Teachers & Staff', description: 'Faculty roles and staff information; official details are to be confirmed.', keywords: 'faculty teacher staff principal educator administration support' },
  { url: 'results.html', title: 'Student Results', description: 'Result notices, examination guidance, and student updates.', keywords: 'results examination achievement grades board privacy' },
  { url: 'gallery.html', title: 'Gallery', description: 'Illustrative campus, learning, and college-life photos.', keywords: 'gallery photos images campus classroom activities events' },
  { url: 'news.html', title: 'News & Events', description: 'Notices, events, and campus announcements.', keywords: 'news notices announcements events admission examination' },
  { url: 'student-life.html', title: 'Student Life', description: 'Activities, teamwork, and opportunities to participate.', keywords: 'student life sports clubs teamwork community activities' },
  { url: 'facilities.html', title: 'Facilities', description: 'Learning spaces and illustrative study-facility imagery.', keywords: 'facilities library computer lab classroom learning spaces' },
  { url: 'faq.html', title: 'FAQs', description: 'Answers about admissions, programs, results, and college life.', keywords: 'faq questions answers help contact admissions' },
  { url: 'downloads.html', title: 'Downloads', description: 'Sample forms, checklists, and document preparation guidance.', keywords: 'downloads forms checklist documents prospectus resources' },
  { url: 'contact.html', title: 'Contact', description: 'Contact the college team for information and guidance.', keywords: 'contact address phone email visit directions message' },
  { url: 'profile.html', title: 'Ali Kashmiri — Profile', description: 'Meet Ali Kashmiri, UX/UI and web designer from Kashmir.', keywords: 'profile Ali Kashmiri designer Figma portfolio TikTok' }
];

const searchOverlay = document.createElement('div');
searchOverlay.className = 'search-overlay';
searchOverlay.hidden = true;
searchOverlay.innerHTML = `
  <section class="search-dialog" role="dialog" aria-modal="true" aria-labelledby="search-title" aria-describedby="search-status" tabindex="-1">
    <div class="search-heading">
      <div><p class="eyebrow">Find your way</p><h2 id="search-title">Search the website</h2></div>
      <button class="search-close" type="button" aria-label="Close search">×</button>
    </div>
    <form class="search-field" role="search">
      <label class="sr-only" for="site-search-input">Search pages</label>
      <span aria-hidden="true">⌕</span>
      <input type="search" id="site-search-input" class="site-search-input" autocomplete="off" placeholder="Try admissions, courses, results…" aria-controls="search-results">
      <kbd>ESC</kbd>
    </form>
    <p class="search-status" aria-live="polite">Search pages, programs, and college information.</p>
    <ul class="search-results" id="search-results"></ul>
  </section>
`;
document.body.appendChild(searchOverlay);

const searchDialog = searchOverlay.querySelector('.search-dialog');
const searchInput = searchOverlay.querySelector('.site-search-input');
const searchResults = searchOverlay.querySelector('.search-results');
const searchStatus = searchOverlay.querySelector('.search-status');
const searchClose = searchOverlay.querySelector('.search-close');
let searchReturnFocus = null;

const renderSearchResults = (rawQuery) => {
  const query = rawQuery.trim().toLowerCase();
  searchResults.replaceChildren();
  if (!query) {
    searchStatus.textContent = 'Search pages, programs, and college information.';
    return;
  }

  const terms = query.split(/\s+/).filter(Boolean);
  const matches = searchPages.map((item) => {
    const title = item.title.toLowerCase();
    const description = item.description.toLowerCase();
    const keywords = item.keywords.toLowerCase();
    const combined = `${title} ${description} ${keywords}`;
    if (!terms.every((term) => combined.includes(term))) return null;
    const score = (title.includes(query) ? 8 : 0) +
      terms.reduce((total, term) => total + (title.includes(term) ? 4 : 0) + (keywords.includes(term) ? 2 : 0) + (description.includes(term) ? 1 : 0), 0);
    return { ...item, score };
  }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 7);

  if (!matches.length) {
    searchStatus.textContent = `No pages found for “${rawQuery.trim()}”. Try a broader search.`;
    return;
  }

  searchStatus.textContent = `${matches.length} page${matches.length === 1 ? '' : 's'} found`;
  matches.forEach((match) => {
    const item = document.createElement('li');
    const link = document.createElement('a');
    const title = document.createElement('strong');
    const description = document.createElement('span');
    link.href = match.url;
    title.textContent = match.title;
    description.textContent = match.description;
    link.append(title, description);
    item.appendChild(link);
    searchResults.appendChild(item);
  });
};

const closeSearch = () => {
  if (searchOverlay.hidden) return;
  searchOverlay.hidden = true;
  document.body.classList.remove('search-open');
  searchTrigger.setAttribute('aria-expanded', 'false');
  if (searchReturnFocus && searchReturnFocus.isConnected) searchReturnFocus.focus();
};

const openSearch = () => {
  const mobileMenuOpen = nav && nav.classList.contains('open');
  searchReturnFocus = mobileMenuOpen ? menuBtn : document.activeElement;
  if (mobileMenuOpen) setMenuState(false);
  searchOverlay.hidden = false;
  document.body.classList.add('search-open');
  searchTrigger.setAttribute('aria-expanded', 'true');
  renderSearchResults(searchInput.value);
  window.requestAnimationFrame(() => searchInput.focus());
};

searchTrigger.addEventListener('click', openSearch);
searchClose.addEventListener('click', closeSearch);
searchInput.addEventListener('input', () => renderSearchResults(searchInput.value));
searchOverlay.addEventListener('click', (event) => {
  if (event.target === searchOverlay) closeSearch();
});
searchOverlay.querySelector('.search-field').addEventListener('submit', (event) => event.preventDefault());
searchOverlay.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;
  const focusable = [...searchDialog.querySelectorAll('input, button, a[href]')].filter((element) => !element.disabled);
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    if (searchOverlay.hidden) openSearch();
    else closeSearch();
  } else if (event.key === 'Escape' && !searchOverlay.hidden) {
    closeSearch();
  }
});

const assistantWidget = document.createElement('section');
assistantWidget.className = 'assistant-widget';
assistantWidget.innerHTML = `
  <button class="assistant-launcher" type="button" aria-expanded="false" aria-controls="assistant-panel" aria-label="Open AI assistant">
    <span class="assistant-launcher-orb" aria-hidden="true"><span></span></span>
    <span class="assistant-launcher-label">Ask the assistant</span>
  </button>
  <section class="assistant-panel" id="assistant-panel" role="dialog" aria-modal="false" aria-labelledby="assistant-title" hidden>
    <header class="assistant-header">
      <div class="assistant-brand">
        <span class="assistant-orb" aria-hidden="true"><span></span></span>
        <div><p class="assistant-kicker">MHC • SECURE AI</p><h2 id="assistant-title">College assistant</h2></div>
      </div>
      <button class="assistant-close" type="button" aria-label="Close AI assistant">×</button>
    </header>
    <div class="assistant-connection"><span class="connection-dot"></span><span class="assistant-connection-label">Checking secure assistant…</span></div>
    <div class="assistant-messages" role="log" aria-live="polite" aria-relevant="additions text" aria-label="Assistant conversation"></div>
    <p class="assistant-notice">AI responses can be inaccurate. College-specific details on this demo site may be samples; confirm official information with the college.</p>
    <div class="assistant-status" role="status" aria-live="polite"></div>
    <form class="assistant-form">
      <label class="sr-only" for="assistant-input">Ask the college assistant</label>
      <textarea class="assistant-input" id="assistant-input" rows="1" maxlength="2000" placeholder="Ask a question…" required></textarea>
      <div class="assistant-controls">
        <button class="assistant-voice" type="button" aria-label="Use voice input" title="Use voice input"><span aria-hidden="true">◉</span></button>
        <button class="assistant-send" type="submit"><span>Send</span><span aria-hidden="true">↑</span></button>
      </div>
    </form>
  </section>
`;
document.body.appendChild(assistantWidget);

const assistantLauncher = assistantWidget.querySelector('.assistant-launcher');
const assistantPanel = assistantWidget.querySelector('.assistant-panel');
const assistantClose = assistantWidget.querySelector('.assistant-close');
const assistantMessages = assistantWidget.querySelector('.assistant-messages');
const assistantStatus = assistantWidget.querySelector('.assistant-status');
const assistantForm = assistantWidget.querySelector('.assistant-form');
const assistantInput = assistantWidget.querySelector('.assistant-input');
const assistantSend = assistantWidget.querySelector('.assistant-send');
const assistantVoice = assistantWidget.querySelector('.assistant-voice');
const assistantConnection = assistantWidget.querySelector('.assistant-connection');
const assistantConnectionLabel = assistantWidget.querySelector('.assistant-connection-label');
const assistantHistory = [];
let assistantBusy = false;
let assistantRecognizer = null;
let assistantVoiceOutput = false;
let assistantFocusReturn = null;

const setAssistantStatus = (message, isError) => {
  assistantStatus.textContent = message;
  assistantStatus.classList.toggle('is-error', Boolean(isError));
};

const setAssistantConnection = (state, message) => {
  assistantConnection.dataset.state = state;
  assistantConnectionLabel.textContent = message;
};

const addAssistantMessage = (role, text) => {
  const message = document.createElement('article');
  message.className = `assistant-message assistant-message-${role}`;
  const label = document.createElement('span');
  label.className = 'assistant-message-label';
  label.textContent = role === 'assistant' ? 'ASSISTANT' : 'YOU';
  const content = document.createElement('p');
  content.className = 'assistant-message-content';
  content.textContent = text;
  message.append(label, content);

  if (role === 'assistant') {
    const speakButton = document.createElement('button');
    speakButton.className = 'assistant-speak';
    speakButton.type = 'button';
    speakButton.textContent = 'Read aloud';
    speakButton.setAttribute('aria-label', 'Read assistant response aloud');
    speakButton.addEventListener('click', () => {
      if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
        setAssistantStatus('Voice output is not supported in this browser.', true);
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onstart = () => setAssistantStatus('Reading response aloud…', false);
      utterance.onend = () => setAssistantStatus('', false);
      utterance.onerror = () => setAssistantStatus('Voice output could not be played. Try again or check your device audio.', true);
      window.speechSynthesis.speak(utterance);
    });
    message.appendChild(speakButton);
  }

  assistantMessages.appendChild(message);
  assistantMessages.scrollTop = assistantMessages.scrollHeight;
};

const openAssistant = () => {
  assistantFocusReturn = document.activeElement;
  assistantPanel.hidden = false;
  assistantLauncher.setAttribute('aria-expanded', 'true');
  assistantLauncher.setAttribute('aria-label', 'Close AI assistant');
  assistantWidget.classList.add('is-open');
  window.requestAnimationFrame(() => assistantInput.focus());
};

const closeAssistant = () => {
  if (assistantPanel.hidden) return;
  assistantPanel.hidden = true;
  assistantLauncher.setAttribute('aria-expanded', 'false');
  assistantLauncher.setAttribute('aria-label', 'Open AI assistant');
  assistantWidget.classList.remove('is-open');
  if (assistantRecognizer) assistantRecognizer.stop();
  if (assistantFocusReturn && assistantFocusReturn.isConnected) assistantFocusReturn.focus();
};

assistantLauncher.addEventListener('click', () => {
  if (assistantPanel.hidden) openAssistant();
  else closeAssistant();
});
assistantClose.addEventListener('click', closeAssistant);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !assistantPanel.hidden) closeAssistant();
});

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SpeechRecognition) {
  assistantVoice.title = 'Voice input is not supported by this browser';
} else {
  assistantRecognizer = new SpeechRecognition();
  assistantRecognizer.lang = navigator.language || 'en-US';
  assistantRecognizer.interimResults = true;
  assistantRecognizer.maxAlternatives = 1;
  assistantRecognizer.onstart = () => {
    assistantVoice.classList.add('is-listening');
    assistantVoice.setAttribute('aria-pressed', 'true');
    setAssistantStatus('Listening… Speak clearly, then pause.', false);
  };
  assistantRecognizer.onresult = (event) => {
    let transcript = '';
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      transcript += event.results[index][0].transcript;
    }
    if (transcript) assistantInput.value = transcript.trim();
  };
  assistantRecognizer.onerror = (event) => {
    const messages = {
      'not-allowed': 'Microphone access was denied. Allow microphone access in browser settings and try again.',
      'service-not-allowed': 'Speech recognition is blocked by browser settings.',
      'audio-capture': 'No microphone was found. Connect a microphone and try again.',
      'no-speech': 'No speech was detected. Try speaking a little closer to the microphone.',
      network: 'Speech recognition needs a network connection. Check your connection and try again.'
    };
    setAssistantStatus(messages[event.error] || 'Voice input stopped unexpectedly. You can type your question instead.', true);
  };
  assistantRecognizer.onend = () => {
    assistantVoice.classList.remove('is-listening');
    assistantVoice.setAttribute('aria-pressed', 'false');
    if (assistantStatus.textContent === 'Listening… Speak clearly, then pause.') setAssistantStatus('', false);
  };
}

assistantVoice.addEventListener('click', () => {
  if (!assistantRecognizer) {
    setAssistantStatus('Voice input is not available in this browser. You can type your question instead.', true);
    return;
  }
  if (assistantBusy) {
    setAssistantStatus('Wait for the current response before using voice input.', true);
    return;
  }
  try {
    assistantRecognizer.start();
  } catch (error) {
    setAssistantStatus('Voice input is already active. Finish speaking or try again shortly.', true);
  }
});

assistantForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const question = assistantInput.value.trim();
  if (!question || assistantBusy) return;

  if (assistantRecognizer) assistantRecognizer.stop();
  addAssistantMessage('user', question);
  assistantInput.value = '';
  assistantBusy = true;
  assistantSend.disabled = true;
  assistantInput.disabled = true;
  assistantVoice.disabled = true;
  assistantStatus.classList.remove('is-error');
  assistantStatus.textContent = '';
  const loadingMessage = document.createElement('div');
  loadingMessage.className = 'assistant-loading';
  loadingMessage.setAttribute('role', 'status');
  loadingMessage.innerHTML = '<span class="assistant-spinner" aria-hidden="true"></span><span>Waiting for a secure AI response…</span>';
  assistantMessages.appendChild(loadingMessage);
  assistantMessages.scrollTop = assistantMessages.scrollHeight;

  const messages = [...assistantHistory, { role: 'user', content: question }].slice(-10);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 50000);

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
      signal: controller.signal
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Assistant request failed (HTTP ${response.status}).`);
    if (typeof result.reply !== 'string' || !result.reply.trim()) throw new Error('The assistant returned an empty response. Please try again.');

    assistantHistory.push({ role: 'user', content: question }, { role: 'assistant', content: result.reply.trim() });
    if (assistantHistory.length > 10) assistantHistory.splice(0, assistantHistory.length - 10);
    addAssistantMessage('assistant', result.reply.trim());
    setAssistantConnection('ready', 'Secure AI connection ready');
    if (assistantVoiceOutput && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(result.reply.trim()));
    }
  } catch (error) {
    const message = window.location.protocol === 'file:'
      ? 'AI chat requires the Express server. Start it with npm run dev and open http://localhost:3000.'
      : error.name === 'AbortError'
        ? 'The response timed out. Check your connection and try again.'
      : error.message === 'Failed to fetch'
        ? 'The assistant server is unavailable. Start the website server and confirm your OpenAI setup.'
        : error.message;
    setAssistantStatus(message, true);
    setAssistantConnection('error', 'Assistant connection needs attention');
  } finally {
    window.clearTimeout(timeout);
    loadingMessage.remove();
    assistantBusy = false;
    assistantSend.disabled = false;
    assistantInput.disabled = false;
    assistantVoice.disabled = false;
    assistantInput.focus();
  }
});

const assistantVoiceOutputToggle = document.createElement('button');
assistantVoiceOutputToggle.className = 'assistant-voice-output';
assistantVoiceOutputToggle.type = 'button';
assistantVoiceOutputToggle.textContent = 'Voice off';
assistantVoiceOutputToggle.setAttribute('aria-pressed', 'false');
assistantVoiceOutputToggle.setAttribute('aria-label', 'Enable automatic voice output');
assistantWidget.querySelector('.assistant-controls').prepend(assistantVoiceOutputToggle);
assistantVoiceOutputToggle.addEventListener('click', () => {
  assistantVoiceOutput = !assistantVoiceOutput;
  assistantVoiceOutputToggle.textContent = assistantVoiceOutput ? 'Voice on' : 'Voice off';
  assistantVoiceOutputToggle.setAttribute('aria-pressed', String(assistantVoiceOutput));
  assistantVoiceOutputToggle.setAttribute('aria-label', `${assistantVoiceOutput ? 'Disable' : 'Enable'} automatic voice output`);
  if (!assistantVoiceOutput && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  if (assistantVoiceOutput && !('speechSynthesis' in window && 'SpeechSynthesisUtterance' in window)) {
    assistantVoiceOutput = false;
    assistantVoiceOutputToggle.textContent = 'Voice off';
    assistantVoiceOutputToggle.setAttribute('aria-pressed', 'false');
    setAssistantStatus('Voice output is not supported in this browser.', true);
  }
});

const checkAssistantHealth = async () => {
  try {
    const response = await fetch('/api/health', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Health check failed');
    const health = await response.json();
    if (health.configured) setAssistantConnection('ready', 'Secure AI connection ready');
    else setAssistantConnection('error', 'AI key not configured on server');
  } catch (error) {
    setAssistantConnection('error', 'Start the website server to use AI chat');
  }
};
checkAssistantHealth();

document.querySelectorAll('[data-year]').forEach((el) => {
  el.textContent = new Date().getFullYear();
});

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let pageLoader;

if (!prefersReducedMotion) {
  if ('IntersectionObserver' in window) document.body.classList.add('motion-ready');
  pageLoader = document.createElement('div');
  pageLoader.className = 'page-loader';
  pageLoader.setAttribute('aria-hidden', 'true');
  pageLoader.innerHTML = '<span class="loader-mark"><img src="images/Musli-hand-imag.png" alt=""></span><span class="loader-name">MUSLIM HANDS</span><span class="loader-line"></span>';
  document.body.appendChild(pageLoader);

  const dismissLoader = () => {
    if (!pageLoader || pageLoader.classList.contains('is-hidden')) return;
    pageLoader.classList.add('is-hidden');
  };

  window.setTimeout(dismissLoader, 750);
  window.addEventListener('load', () => window.setTimeout(dismissLoader, 300), { once: true });

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (link.target || link.hasAttribute('download')) return;

    const destination = new URL(link.href, window.location.href);
    if (destination.origin !== window.location.origin || !destination.pathname.endsWith('.html')) return;
    if (destination.pathname === window.location.pathname && !destination.search) return;

    event.preventDefault();
    document.body.classList.add('page-leaving');
    if (pageLoader) {
      pageLoader.classList.remove('is-hidden');
      pageLoader.classList.add('is-leaving');
    }
    window.setTimeout(() => window.location.assign(destination.href), 220);
  });
}

const pageImages = {
  home: {
    hero: {
      src: 'images/college-building.png',
      alt: 'Muslim Hands College of Excellence campus building',
      label: 'Campus'
    },
    gallery: [
      { src: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=900&q=80', alt: 'Students collaborating in a classroom', label: 'Student learning' },
      { src: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=900&q=80', alt: 'Students learning together on campus', label: 'Campus community' },
      { src: 'https://images.unsplash.com/photo-1523580494863-6f3031224c94?auto=format&fit=crop&w=900&q=80', alt: 'Illustrative student event', label: 'Campus activities' }
    ]
  },
  about: {
    hero: {
      src: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=1200&q=80',
      alt: 'College students learning in a modern educational environment',
      label: 'Learning environment'
    },
    gallery: [
      { src: 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&w=900&q=80', alt: 'College campus buildings and grounds', label: 'Campus' },
      { src: 'https://images.unsplash.com/photo-1513258496099-48168024aec0?auto=format&fit=crop&w=900&q=80', alt: 'Teacher supporting student development in class', label: 'Student growth' },
      { src: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=900&q=80', alt: 'Students reading and learning together', label: 'Knowledge' }
    ]
  },
  admissions: {
    hero: {
      src: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1200&q=80',
      alt: 'Students receiving guidance for admissions and registration',
      label: 'Admissions support'
    },
    gallery: [
      { src: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=900&q=80', alt: 'Student registration and application preparation', label: 'Application' },
      { src: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=900&q=80', alt: 'Students discussing academic planning', label: 'Guidance' },
      { src: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=900&q=80', alt: 'Classroom space for future students', label: 'New opportunities' }
    ]
  },
  programs: {
    hero: {
      src: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=1200&q=80',
      alt: 'Students learning in a classroom with academic focus',
      label: 'Academic programs'
    },
    gallery: [
      { src: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=900&q=80', alt: 'Students studying together in a classroom', label: 'Classroom learning' },
      { src: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=900&q=80', alt: 'Books and science learning resources', label: 'Science & study' },
      { src: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80', alt: 'Computer studies and digital teaching', label: 'Computer studies' }
    ]
  },
  courses: {
    hero: {
      src: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=1200&q=80',
      alt: 'Books, classroom environment and educational activities',
      label: 'Courses'
    },
    gallery: [
      { src: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80', alt: 'Students in digital education and computer labs', label: 'Digital education' },
      { src: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=900&q=80', alt: 'Science and educational materials', label: 'Science learning' },
      { src: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=900&q=80', alt: 'Collaborative study and academic preparation', label: 'Academic focus' }
    ]
  },
  faculty: {
    hero: {
      src: 'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=1200&q=80',
      alt: 'Teacher guiding students in a classroom',
      label: 'Faculty support'
    },
    gallery: [
      { src: 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=900&q=80', alt: 'Teacher delivering a lesson to students', label: 'Teaching' },
      { src: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=900&q=80', alt: 'Mentorship and student support', label: 'Mentorship' },
      { src: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=900&q=80', alt: 'Supportive classroom culture', label: 'Learning culture' }
    ]
  },
  results: {
    hero: {
      src: 'images/college-building.png',
      alt: 'Muslim Hands College of Excellence campus building; no student results are shown',
      label: 'Result notices'
    },
    gallery: [
      { src: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=900&q=80', alt: 'Students celebrating success', label: 'Academic success' },
      { src: 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&w=900&q=80', alt: 'Campus pride and achievement', label: 'Recognition' },
      { src: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=900&q=80', alt: 'Students receiving encouragement', label: 'Opportunity' }
    ]
  },
  gallery: {
    hero: {
      src: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1200&q=80',
      alt: 'College life captured in a gallery setting',
      label: 'Campus gallery'
    },
    gallery: [
      { src: 'images/college-building.png', alt: 'Muslim Hands College of Excellence campus building', label: 'Campus' },
      { src: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=900&q=80', alt: 'Students learning together in a bright classroom', label: 'Classroom learning' },
      { src: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=900&q=80', alt: 'Students collaborating on a team project', label: 'Student activities' },
      { src: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=900&q=80', alt: 'Reading and study materials in the college', label: 'Reading' },
      { src: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80', alt: 'Computer studies and digital learning', label: 'Digital learning' },
      { src: 'https://images.unsplash.com/photo-1523580494863-6f3031224c94?auto=format&fit=crop&w=900&q=80', alt: 'Illustrative college event', label: 'Event day' }
    ]
  },
  news: {
    hero: {
      src: 'https://images.unsplash.com/photo-1523580494863-6f3031224c94?auto=format&fit=crop&w=1200&q=80',
      alt: 'College event and student gathering',
      label: 'College news'
    },
    gallery: [
      { src: 'https://images.unsplash.com/photo-1523580494863-6f3031224c94?auto=format&fit=crop&w=900&q=80', alt: 'Students gathering for an event', label: 'Campus event' },
      { src: 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&w=900&q=80', alt: 'Campus life and celebrations', label: 'Campus life' },
      { src: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=900&q=80', alt: 'Students taking part in active campus life', label: 'Activities' }
    ]
  },
  'student-life': {
    hero: {
      src: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1200&q=80',
      alt: 'Students enjoying teamwork and campus life',
      label: 'Student life'
    },
    gallery: [
      { src: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=900&q=80', alt: 'Students collaborating on a campus project', label: 'Teamwork' },
      { src: 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&w=900&q=80', alt: 'Students on campus grounds and community life', label: 'Campus community' },
      { src: 'https://images.unsplash.com/photo-1513258496099-48168024aec0?auto=format&fit=crop&w=900&q=80', alt: 'Students engaging in study and activities', label: 'Campus activities' }
    ]
  },
  facilities: {
    hero: {
      src: 'images/college-building.png',
      alt: 'Muslim Hands College of Excellence campus building',
      label: 'Facilities'
    },
    gallery: [
      { src: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=900&q=80', alt: 'Illustrative library and study resources, not a verified college facility', label: 'Illustrative study resources' },
      { src: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=900&q=80', alt: 'Science and lab learning spaces', label: 'Lab spaces' },
      { src: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80', alt: 'Computer labs and digital facilities', label: 'Computer labs' }
    ]
  },
  faq: {
    hero: {
      src: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=1200&q=80',
      alt: 'Students learning with faculty support and guidance',
      label: 'Support'
    },
    gallery: [
      { src: 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&w=900&q=80', alt: 'Campus support and friendly environment', label: 'Friendly campus' },
      { src: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=900&q=80', alt: 'Student support and collaborative guidance', label: 'Student support' },
      { src: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=900&q=80', alt: 'Learning environment with teacher support', label: 'Academic guidance' }
    ]
  },
  downloads: {
    hero: {
      src: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80',
      alt: 'Students using digital learning resources',
      label: 'Downloads'
    },
    gallery: [
      { src: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=900&q=80', alt: 'Academic materials and study resources', label: 'Study resources' },
      { src: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=900&q=80', alt: 'Books and educational documents', label: 'Resources' },
      { src: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=900&q=80', alt: 'Illustrative books and academic study materials', label: 'Study materials' }
    ]
  },
  contact: {
    hero: {
      src: 'images/college-building.png',
      alt: 'Muslim Hands College of Excellence campus building',
      label: 'Visit us'
    },
    gallery: [
      { src: 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&w=900&q=80', alt: 'College entrance and campus faces', label: 'Campus' },
      { src: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=900&q=80', alt: 'Friendly college learning space', label: 'Support' },
      { src: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=900&q=80', alt: 'Students and staff in a welcoming setting', label: 'Welcome' }
    ]
  },
  apply: {
    hero: {
      src: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1200&q=80',
      alt: 'Student application and admissions process',
      label: 'Apply now'
    },
    gallery: [
      { src: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=900&q=80', alt: 'Admission paperwork and guidance', label: 'Application' },
      { src: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=900&q=80', alt: 'Counselling and student support session', label: 'Guidance' },
      { src: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=900&q=80', alt: 'Illustrative study materials for prospective students', label: 'Study resources' }
    ]
  }
};

const buildMediaStrip = (items) => {
  const wrapper = document.createElement('div');
  wrapper.className = 'image-strip';
  wrapper.innerHTML = items.map((item) => `
    <figure class="photo-card">
      <img src="${item.src}" alt="${item.alt}" loading="lazy" decoding="async">
      <figcaption>${item.src.startsWith('http') ? 'Illustrative • ' : ''}${item.label}</figcaption>
    </figure>
  `).join('');
  return wrapper;
};

const detectPage = () => {
  const path = window.location.pathname.split('/').pop() || 'index.html';
  const pageMap = {
    'index.html': 'home',
    'about.html': 'about',
    'admissions.html': 'admissions',
    'apply.html': 'apply',
    'contact.html': 'contact',
    'courses.html': 'courses',
    'downloads.html': 'downloads',
    'facilities.html': 'facilities',
    'faculty.html': 'faculty',
    'faq.html': 'faq',
    'gallery.html': 'gallery',
    'news.html': 'news',
    'programs.html': 'programs',
    'results.html': 'results',
    'student-life.html': 'student-life',
    '404.html': 'not-found'
  };

  return pageMap[path] || 'home';
};

document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page || detectPage();
  const pageData = pageImages[page];

  if (pageData && pageData.hero) {
    const heroArt = document.querySelector('.hero-art');
    if (heroArt && !heroArt.querySelector('img')) {
      heroArt.innerHTML = `
        <img src="${pageData.hero.src}" alt="${pageData.hero.alt}" loading="eager" decoding="async" fetchpriority="high">
        <div class="art-overlay">
          <div class="big-crest">MH</div>
          <h3>${pageData.hero.label}</h3>
        </div>
      `;
    }

    const pageHero = document.querySelector('.page-hero .container');
    if (pageHero && !pageHero.querySelector('.page-hero-visual')) {
      const visual = document.createElement('div');
      visual.className = 'page-hero-visual';
      visual.innerHTML = `
        <img src="${pageData.hero.src}" alt="${pageData.hero.alt}" loading="eager" decoding="async" fetchpriority="high">
        <figcaption>${pageData.hero.src.startsWith('http') ? 'Illustrative • ' : ''}${pageData.hero.label}</figcaption>
      `;
      pageHero.appendChild(visual);
    }
  }

  if (pageData && pageData.gallery && !document.querySelector('.image-strip') && !document.querySelector('.gallery-grid')) {
    const firstSection = document.querySelector('.hero, .page-hero, .section');
    const wrapper = buildMediaStrip(pageData.gallery);
    if (firstSection) {
      firstSection.insertAdjacentElement('afterend', wrapper);
    }
  }

  if (page === 'gallery' && document.querySelector('.gallery-grid')) {
    const galleryTiles = document.querySelectorAll('.gallery-item');
    galleryTiles.forEach((tile, index) => {
      const item = pageImages.gallery.gallery[index] || pageImages.gallery.gallery[0];
      if (item) {
        tile.innerHTML = `
          <img src="${item.src}" alt="${item.alt}" loading="lazy" decoding="async">
          <strong>${item.src.startsWith('http') ? 'Illustrative • ' : ''}${item.label}</strong>
        `;
      }
    });
  }

  if (!prefersReducedMotion && 'IntersectionObserver' in window) {
    const revealElements = document.querySelectorAll(
      '.section-head, .section > .container > .grid > *, .stats > *, .banner, .notice, ' +
      '.page-hero .container > *, .image-strip > *, .gallery-grid > *, .footer-grid > *, ' +
      '.creator-credit, .copyright, .card, .faq details, .not-found > *'
    );
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -24px 0px' });

    revealElements.forEach((element) => {
      const siblingIndex = Array.prototype.indexOf.call(element.parentElement.children, element);
      element.classList.add('scroll-reveal');
      element.style.setProperty('--reveal-delay', `${Math.min(siblingIndex * 75, 225)}ms`);
      revealObserver.observe(element);
    });
  }

  if (!prefersReducedMotion && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    document.querySelectorAll('.card, .photo-card, .gallery-item, .media-card, .stat, .hero-art, .banner').forEach((element) => {
      element.classList.add('tilt-item');
      element.addEventListener('pointermove', (event) => {
        const bounds = element.getBoundingClientRect();
        const x = (event.clientX - bounds.left) / bounds.width - 0.5;
        const y = (event.clientY - bounds.top) / bounds.height - 0.5;
        element.style.setProperty('--tilt-x', `${-y * 4}deg`);
        element.style.setProperty('--tilt-y', `${x * 4}deg`);
      });
      element.addEventListener('pointerleave', () => {
        element.style.setProperty('--tilt-x', '0deg');
        element.style.setProperty('--tilt-y', '0deg');
      });
    });
  }

  if (!prefersReducedMotion) {
    const parallaxImages = document.querySelectorAll('.hero-art img, .page-hero-visual img');
    parallaxImages.forEach((image) => image.setAttribute('data-parallax', ''));
    if (parallaxImages.length) {
      let parallaxFrame = 0;
      const updateParallax = () => {
        parallaxImages.forEach((image) => {
          const bounds = image.parentElement.getBoundingClientRect();
          const offset = (bounds.top + bounds.height / 2 - window.innerHeight / 2) * -0.025;
          image.style.setProperty('--parallax-y', `${Math.max(-18, Math.min(18, offset))}px`);
        });
        parallaxFrame = 0;
      };
      window.addEventListener('scroll', () => {
        if (!parallaxFrame) parallaxFrame = window.requestAnimationFrame(updateParallax);
      }, { passive: true });
      updateParallax();
    }
  }

  document.querySelectorAll('form[data-demo-form]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const toast = form.querySelector('.toast');
      const requiredFields = form.querySelectorAll('input[required], textarea[required], select[required]');

      let hasInvalid = false;
      requiredFields.forEach((field) => {
        const isValid = field.checkValidity();
        field.setAttribute('aria-invalid', String(!isValid));
        if (!isValid && !hasInvalid) {
          hasInvalid = true;
          field.focus();
        }
      });

      if (!toast) return;

      if (!form.checkValidity() || hasInvalid) {
        toast.classList.add('show');
        toast.textContent = 'Please complete all required fields before submitting this enquiry.';
        return;
      }

      toast.classList.add('show');
      toast.textContent = 'Thank you! This demo form works in your browser, but it does not send data to the college. Connect a secure backend before publishing for real applications.';
      form.reset();
    });
  });

  document.querySelectorAll('form[data-admission-form]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const message = form.querySelector('[data-admission-message]');
      const button = form.querySelector('button[type="submit"]');
      if (!form.reportValidity()) return;
      const originalLabel = button.textContent;
      button.disabled = true;
      button.textContent = 'Sending securely…';
      message.classList.remove('error', 'show');
      message.textContent = '';
      const details = Object.fromEntries(new FormData(form).entries());
      details.consent = form.elements.namedItem('consent').checked;
      try {
        const response = await fetch('/api/admissions', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(details)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Your inquiry could not be submitted.');
        form.reset();
        message.textContent = `Your inquiry has been sent to the admissions team. Reference: ${data.reference}.`;
        message.classList.add('show');
      } catch (error) {
        message.classList.add('error', 'show');
        message.textContent = error.message || 'The server could not be reached. Please try again.';
      } finally {
        button.disabled = false;
        button.textContent = originalLabel;
      }
    });
  });

  if (!prefersReducedMotion) {
    const progress = document.createElement('div');
    progress.className = 'scroll-progress';
    progress.setAttribute('aria-hidden', 'true');
    progress.innerHTML = '<span></span>';
    document.body.appendChild(progress);

    let progressFrame = 0;
    const updateScrollProgress = () => {
      const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
      const amount = scrollableHeight > 0 ? window.scrollY / scrollableHeight : 0;
      progress.style.setProperty('--scroll-progress', String(Math.max(0, Math.min(1, amount))));
      progressFrame = 0;
    };
    const requestScrollProgress = () => {
      if (!progressFrame) progressFrame = window.requestAnimationFrame(updateScrollProgress);
    };
    window.addEventListener('scroll', requestScrollProgress, { passive: true });
    window.addEventListener('resize', requestScrollProgress, { passive: true });
    updateScrollProgress();

    const particleLayer = document.createElement('div');
    particleLayer.className = 'ambient-particles';
    particleLayer.setAttribute('aria-hidden', 'true');
    for (let index = 0; index < 12; index += 1) {
      const particle = document.createElement('span');
      particle.className = 'ambient-particle';
      particle.style.setProperty('--particle-x', `${Math.random() * 100}%`);
      particle.style.setProperty('--particle-size', `${2 + Math.random() * 2}px`);
      particle.style.setProperty('--particle-duration', `${23 + Math.random() * 17}s`);
      particle.style.setProperty('--particle-delay', `${-Math.random() * 40}s`);
      particleLayer.appendChild(particle);
    }
    document.body.insertBefore(particleLayer, document.body.firstChild);

    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      document.querySelectorAll('.btn, .header-action, .menu-btn').forEach((element) => {
        let frame = 0;
        element.addEventListener('pointermove', (event) => {
          if (frame) window.cancelAnimationFrame(frame);
          frame = window.requestAnimationFrame(() => {
            const bounds = element.getBoundingClientRect();
            const x = (event.clientX - bounds.left) / bounds.width - .5;
            const y = (event.clientY - bounds.top) / bounds.height - .5;
            element.style.setProperty('--magnetic-x', `${x * 5}px`);
            element.style.setProperty('--magnetic-y', `${y * 5}px`);
            frame = 0;
          });
        });
        element.addEventListener('pointerleave', () => {
          if (frame) window.cancelAnimationFrame(frame);
          frame = 0;
          element.style.setProperty('--magnetic-x', '0px');
          element.style.setProperty('--magnetic-y', '0px');
        });
      });
    }
  }
});
