const authForm = document.querySelector('[data-auth-form]');
const formMessage = document.querySelector('[data-form-message]');
const sessionPanel = document.querySelector('[data-session-panel]');
const sessionMessage = document.querySelector('[data-session-message]');

const showMessage = (message, kind = 'error') => {
  if (!formMessage) return;
  formMessage.textContent = message;
  formMessage.dataset.kind = kind;
};

const updateSessionPanel = (user) => {
  if (!sessionPanel || !authForm) return;
  sessionPanel.hidden = !user;
  authForm.hidden = Boolean(user);
  if (user && sessionMessage) {
    sessionMessage.textContent = `You are signed in as ${user.name} (${user.role}).`;
  }
};

const classSelect = document.querySelector('[data-class-options]');
if (classSelect) {
  const classHint = document.querySelector('[data-class-hint]');
  fetch('/api/auth/classes', { credentials: 'same-origin' })
    .then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Available classes could not be loaded.');
      classSelect.replaceChildren(new Option('Choose your class or program', ''));
      data.classes.forEach((item) => {
        classSelect.add(new Option(`${item.name}${item.code ? ` · ${item.code}` : ''}`, String(item.id)));
      });
      if (!data.classes.length) {
        classSelect.replaceChildren(new Option('No classes are available yet', ''));
        classSelect.disabled = true;
        if (classHint) classHint.textContent = 'Please contact the college to set up your class before registering.';
      }
    })
    .catch((error) => {
      classSelect.replaceChildren(new Option('Classes could not be loaded', ''));
      classSelect.disabled = true;
      if (classHint) classHint.textContent = error.message || 'Refresh the page and try again.';
    });
}

document.querySelectorAll('[data-password-toggle]').forEach((button) => {
  button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.passwordToggle);
    if (!input) return;
    const isVisible = input.type === 'text';
    input.type = isVisible ? 'password' : 'text';
    button.textContent = isVisible ? 'Show' : 'Hide';
    button.setAttribute('aria-label', `${isVisible ? 'Show' : 'Hide'} ${input.id === 'signup-password' ? 'password' : 'confirm password'}`);
    button.setAttribute('aria-pressed', String(!isVisible));
  });
});

document.querySelectorAll('[data-auth-navigation]').forEach((link) => {
  link.addEventListener('click', (event) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) return;
    event.preventDefault();
    document.querySelector('.auth-shell')?.classList.add('is-leaving');
    window.setTimeout(() => window.location.assign(link.href), 220);
  });
});

const particleLayer = document.querySelector('[data-particles]');
if (particleLayer && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  for (let index = 0; index < 14; index += 1) {
    const particle = document.createElement('span');
    particle.className = 'particle';
    particle.style.setProperty('--x', `${Math.random() * 100}%`);
    particle.style.setProperty('--size', `${2 + Math.random() * 3}px`);
    particle.style.setProperty('--duration', `${20 + Math.random() * 18}s`);
    particle.style.setProperty('--delay', `${-Math.random() * 36}s`);
    particleLayer.append(particle);
  }
}

if (authForm) {
  fetch('/api/auth/me', { credentials: 'same-origin' })
    .then(async (response) => {
      if (!response.ok) throw new Error('Could not check the current sign-in status.');
      const data = await response.json();
      updateSessionPanel(data.user);
    })
    .catch(() => {
      showMessage('Sign-in status could not be checked. Please refresh and try again.');
    });

  authForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    showMessage('');

    if (!authForm.reportValidity()) return;
    const formData = new FormData(authForm);
    if (authForm.dataset.endpoint.endsWith('/signup')) {
      if (formData.get('password') !== formData.get('confirmPassword')) {
        showMessage('Your passwords do not match.');
        document.querySelector('#signup-confirm-password')?.focus();
        return;
      }
    }

    const submitButton = authForm.querySelector('button[type="submit"]');
    const originalText = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = 'Please wait…';

    const body = Object.fromEntries(formData.entries());
    const selectedRole = authForm.querySelector('input[name="role"]:checked');
    if (selectedRole) body.role = selectedRole.value;
    if (authForm.querySelector('input[name="terms"]')) body.terms = formData.get('terms') === 'true';

    try {
      const response = await fetch(authForm.dataset.endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not complete the request.');
      updateSessionPanel(data.user);
      showMessage('Your account is ready. You are signed in.', 'success');
      window.setTimeout(() => {
        const destination = {
          admin: 'admin.html',
          teacher: 'teacher.html',
          student: 'student.html'
        }[data.user.role];
        if (destination) window.location.assign(destination);
      }, 700);
    } catch (error) {
      showMessage(error.message || 'The server could not be reached. Please try again.');
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = originalText;
    }
  });
}

document.querySelectorAll('[data-logout]').forEach((button) => {
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin'
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not sign out.');
      updateSessionPanel(null);
      showMessage('You have signed out.', 'success');
    } catch (error) {
      showMessage(error.message || 'The server could not be reached. Please try again.');
    } finally {
      button.disabled = false;
    }
  });
});
