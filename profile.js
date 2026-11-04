const profileApi = async (method = 'GET', body) => {
  const response = await fetch('/api/profile', {
    method,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The profile request could not be completed.');
  return data;
};

const profileForm = document.querySelector('[data-profile-form]');
const profileEditor = document.querySelector('[data-profile-editor]');
const profileMessage = document.querySelector('[data-profile-message]');
let profileData;

const setText = (selector, value) => {
  const element = document.querySelector(selector);
  if (element) element.textContent = value || '';
};

const renderProfile = (profile) => {
  profileData = profile;
  document.title = `${profile.profileName} | Personal Profile`;
  document.querySelector('meta[name="description"]').content =
    `Meet ${profile.profileName}, ${profile.profession} from ${profile.background.replace(/^From /i, '')}.`;
  setText('[data-profile-name]', profile.profileName);
  setText('[data-full-name]', profile.fullName);
  setText('[data-profession]', profile.profession);
  setText('[data-location]', profile.location);
  setText('[data-background]', profile.background);
  setText('[data-bio]', profile.bio);
  setText('[data-education]', profile.education);
  setText('[data-college]', profile.college);
  setText('[data-fact-location]', profile.location);
  setText('[data-fact-background]', profile.background);
  setText('[data-contact-location]', profile.location);
  let tiktokHandle = 'TikTok profile not added';
  try {
    const handle = new URL(profile.tiktokUrl).pathname.split('/').filter(Boolean).pop();
    if (handle) tiktokHandle = handle.startsWith('@') ? handle : `@${handle}`;
  } catch {
    if (profile.tiktokUrl) tiktokHandle = 'TikTok profile';
  }
  setText('[data-tiktok-handle]', tiktokHandle);

  const initials = profile.profileName.trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase();
  setText('[data-profile-initials]', initials || 'AK');
  setText('[data-profile-nav-name]', profile.profileName);
  const navLink = document.querySelector('.profile-nav-link');
  if (navLink) navLink.setAttribute('aria-label', `View ${profile.profileName}'s profile`);
  document.querySelector('.profile-avatar').setAttribute('aria-label', `${profile.profileName} profile picture`);
  const navAvatar = document.querySelector('[data-profile-nav-avatar]');
  if (navAvatar) {
    navAvatar.textContent = initials || 'AK';
    if (profile.avatarUrl) {
      const navImage = document.createElement('img');
      navImage.src = profile.avatarUrl;
      navImage.alt = '';
      navImage.referrerPolicy = 'no-referrer';
      navImage.addEventListener('error', () => { navAvatar.textContent = initials || 'AK'; });
      navAvatar.replaceChildren(navImage);
    }
  }
  const avatar = document.querySelector('[data-avatar-image]');
  avatar.alt = profile.profileName;
  const avatarFallback = document.querySelector('[data-profile-initials]');
  avatar.onerror = () => {
    avatar.hidden = true;
    avatar.removeAttribute('src');
    avatarFallback.hidden = false;
  };
  if (profile.avatarUrl) {
    avatar.referrerPolicy = 'no-referrer';
    avatar.src = profile.avatarUrl;
    avatar.hidden = false;
    avatarFallback.hidden = true;
  } else {
    avatar.removeAttribute('src');
    avatar.hidden = true;
    avatarFallback.hidden = false;
  }

  const skills = document.querySelector('[data-skills]');
  skills.replaceChildren(...profile.skills.map((skill) => {
    const tag = document.createElement('span');
    tag.className = 'profile-skill';
    tag.textContent = skill;
    return tag;
  }));

  const labels = [
    ['tiktokUrl', 'TikTok'],
    ['websiteUrl', 'Portfolio'],
    ['instagramUrl', 'Instagram'],
    ['facebookUrl', 'Facebook'],
    ['behanceUrl', 'Behance'],
    ['linkedinUrl', 'LinkedIn']
  ];
  const links = document.querySelector('[data-profile-links]');
  const linkNodes = labels.filter(([key]) => profile[key]).map(([key, label]) => {
    const link = document.createElement('a');
    link.className = 'profile-social-link';
    link.href = profile[key];
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = label;
    return link;
  });
  links.replaceChildren(...linkNodes);

  const values = {
    fullName: profile.fullName,
    profileName: profile.profileName,
    location: profile.location,
    background: profile.background,
    profession: profile.profession,
    education: profile.education,
    college: profile.college,
    bio: profile.bio,
    skills: profile.skills.join(', '),
    avatarUrl: profile.avatarUrl,
    tiktokUrl: profile.tiktokUrl,
    instagramUrl: profile.instagramUrl,
    facebookUrl: profile.facebookUrl,
    behanceUrl: profile.behanceUrl,
    linkedinUrl: profile.linkedinUrl,
    websiteUrl: profile.websiteUrl
  };
  Object.entries(values).forEach(([name, value]) => {
    profileForm.elements.namedItem(name).value = value || '';
  });
};

const loadProfile = async () => {
  try {
    const { profile, canEdit } = await profileApi();
    renderProfile(profile);
    document.querySelector('[data-profile-edit]').hidden = !canEdit;
    document.querySelector('[data-profile-login-note]').hidden = Boolean(canEdit);
    document.querySelector('[data-profile-status]').textContent = '';
  } catch (error) {
    document.querySelector('[data-profile-status]').textContent = error.message;
    document.querySelector('[data-profile-status]').classList.add('error');
  }
};

document.querySelector('[data-profile-edit]').addEventListener('click', () => {
  profileEditor.hidden = false;
  profileMessage.textContent = '';
  profileMessage.classList.remove('error');
  profileEditor.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  profileForm.elements.fullName.focus({ preventScroll: true });
});

document.querySelector('[data-profile-cancel]').addEventListener('click', () => {
  if (profileData) renderProfile(profileData);
  profileEditor.hidden = true;
  profileMessage.textContent = '';
  profileMessage.classList.remove('error');
});

profileForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!profileForm.reportValidity()) return;
  const submitButton = profileForm.querySelector('[type="submit"]');
  submitButton.disabled = true;
  profileMessage.textContent = '';
  profileMessage.classList.remove('error');
  const values = Object.fromEntries(new FormData(profileForm).entries());
  values.skills = values.skills.split(',').map((skill) => skill.trim()).filter(Boolean);
  try {
    const { profile, canEdit } = await profileApi('PATCH', values);
    if (!canEdit) throw new Error('Your account is no longer authorized to edit this profile.');
    renderProfile(profile);
    document.querySelector('[data-profile-login-note]').hidden = true;
    profileMessage.textContent = 'Your profile changes have been saved.';
  } catch (error) {
    profileMessage.textContent = error.message;
    profileMessage.classList.add('error');
  } finally {
    submitButton.disabled = false;
  }
});

loadProfile();
