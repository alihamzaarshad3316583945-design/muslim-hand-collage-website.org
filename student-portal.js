const api = async (url, options = {}) => {
  const response = await fetch(url, { credentials: 'same-origin', ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
};
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));
const toast = document.querySelector('[data-toast]');
let toastTimer;
const scrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
const showToast = (message) => {
  toast.textContent = message;
  toast.classList.add('show', 'error');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('show', 'error'), 4500);
};
const money = (cents, currency) => `${escapeHtml(currency || 'PKR')} ${(Number(cents || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const initials = (name) => String(name || 'ST').split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase();
const emptyRow = (selector, count, text) => { document.querySelector(selector).innerHTML = `<tr><td class="empty-state" colspan="${count}">${escapeHtml(text)}</td></tr>`; };
const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const metricFrames = new WeakMap();
const setAnimatedCount = (element, value, format = (count) => count.toLocaleString()) => {
  const target = Number(value);
  if (!Number.isFinite(target)) return;
  const previousFrame = metricFrames.get(element);
  if (previousFrame) window.cancelAnimationFrame(previousFrame);
  const start = Number(element.dataset.metricValue || 0);
  element.dataset.metricValue = String(target);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || start === target) {
    element.textContent = format(target);
    return;
  }
  const startTime = performance.now();
  const duration = 720;
  const tick = (now) => {
    const progress = Math.min(1, (now - startTime) / duration);
    const eased = 1 - (1 - progress) ** 4;
    element.textContent = format(Math.round(start + (target - start) * eased));
    if (progress < 1) metricFrames.set(element, window.requestAnimationFrame(tick));
    else {
      element.textContent = format(target);
      metricFrames.delete(element);
    }
  };
  metricFrames.set(element, window.requestAnimationFrame(tick));
};

const loadPortal = async () => {
  const data = await api('/api/management/portal');
  const { profile, attendance, attendanceSummary, fees, results, timetable, assignments, notices, settings } = data;
  document.querySelectorAll('[data-name]').forEach((node) => { node.textContent = profile.name; });
  document.querySelectorAll('[data-avatar]').forEach((node) => { node.textContent = initials(profile.name); });
  document.querySelector('[data-class]').textContent = profile.className || 'Class not assigned';
  document.querySelector('[data-class-name]').textContent = profile.className ? ` · ${profile.className}` : ' · Class not assigned';
  document.querySelector('[data-student-number]').textContent = profile.studentNumber ? `Student no. ${profile.studentNumber}` : '';
  document.querySelector('[data-college]').textContent = settings.college_name || 'STUDENT PORTAL';
  document.title = `Student portal | ${settings.college_name || 'Muslim Hands College'}`;

  const total = Number(attendanceSummary.total || 0);
  const attended = Number(attendanceSummary.attended || 0);
  if (total) setAnimatedCount(document.querySelector('[data-attendance-rate]'), Math.round(attended * 100 / total), (rate) => `${rate}%`);
  else document.querySelector('[data-attendance-rate]').textContent = '—';
  document.querySelector('[data-attendance-caption]').textContent = total ? `${total} recorded school days` : 'No attendance records yet';
  if (total) setAnimatedCount(document.querySelector('[data-attendance-count]'), attended);
  else document.querySelector('[data-attendance-count]').textContent = '—';
  const balance = fees.reduce((sum, fee) => sum + Number(fee.balanceCents), 0);
  document.querySelector('[data-fee-balance]').textContent = money(balance, settings.currency);
  setAnimatedCount(document.querySelector('[data-result-count]'), results.length);

  if (!attendance.length) emptyRow('[data-attendance]', 3, 'Attendance records will appear here after your teacher marks the class register.');
  else document.querySelector('[data-attendance]').innerHTML = attendance.map((record) => `<tr><td>${escapeHtml(record.date)}</td><td>${escapeHtml(profile.className || 'Assigned class')}</td><td><span class="status-pill ${escapeHtml(record.status)}">${escapeHtml(record.status)}</span></td></tr>`).join('');

  if (!results.length) emptyRow('[data-results]', 4, 'Your published exam results will appear here.');
  else document.querySelector('[data-results]').innerHTML = results.map((item) => `<tr><td>${escapeHtml(item.examName)}</td><td><strong>${escapeHtml(item.subject)}</strong></td><td>${Number(item.score)} / ${Number(item.maximumScore)}</td><td><span class="status-pill ${item.percentage >= 50 ? 'active' : 'absent'}">${Number(item.percentage).toFixed(1)}%</span></td></tr>`).join('');

  const assignmentPanel = document.querySelector('[data-assignments]');
  assignmentPanel.innerHTML = assignments.length
    ? assignments.map((item) => `<article class="notice-card"><div class="notice-top"><h3>${escapeHtml(item.title)}</h3><span class="notice-audience">Due ${escapeHtml(item.dueDate)}</span></div><p>${escapeHtml(item.description)}</p></article>`).join('')
    : '<p class="empty-state">Your class has no current assignments.</p>';

  if (!fees.length) emptyRow('[data-fees]', 6, 'The college has not added any fee records to your account.');
  else document.querySelector('[data-fees]').innerHTML = fees.map((fee) => `<tr><td><strong>${escapeHtml(fee.label)}</strong></td><td>${money(fee.amountCents, settings.currency)}</td><td>${money(fee.paidCents, settings.currency)}</td><td>${money(fee.balanceCents, settings.currency)}</td><td>${escapeHtml(fee.dueDate)}</td><td><span class="status-pill ${escapeHtml(fee.status)}">${escapeHtml(fee.status)}</span></td></tr>`).join('');

  if (!timetable.length) emptyRow('[data-timetable]', 4, profile.className ? 'Your class timetable has not been published yet.' : 'Contact the college to be assigned to a class.');
  else document.querySelector('[data-timetable]').innerHTML = timetable.map((item) => `<tr><td>${dayNames[item.weekday - 1]}</td><td>${escapeHtml(item.startTime)}–${escapeHtml(item.endTime)}</td><td><strong>${escapeHtml(item.subject)}</strong></td><td>${escapeHtml(item.room || '—')}</td></tr>`).join('');

  const noticePanel = document.querySelector('[data-notices]');
  noticePanel.innerHTML = notices.length ? notices.map((notice) => `<article class="notice-card"><div class="notice-top"><h3>${escapeHtml(notice.title)}</h3><span class="notice-audience">${escapeHtml(notice.audience)}</span></div><p>${escapeHtml(notice.body)}</p><small>${escapeHtml(new Date(`${notice.createdAt.replace(' ', 'T')}Z`).toLocaleString())}</small></article>`).join('') : '<p class="empty-state">There are no current notices.</p>';
};

document.querySelector('[data-today]').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
document.querySelector('[data-menu]').addEventListener('click', () => document.querySelector('.sidebar').classList.toggle('open'));
document.querySelectorAll('[data-scroll]').forEach((button) => button.addEventListener('click', () => {
  document.getElementById(button.dataset.scroll).scrollIntoView({ behavior: scrollBehavior, block: 'start' });
  document.querySelectorAll('[data-scroll]').forEach((item) => item.classList.toggle('active', item === button));
  document.querySelector('.sidebar').classList.remove('open');
}));
document.querySelectorAll('[data-logout]').forEach((button) => button.addEventListener('click', async () => {
  try {
    const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    if (!response.ok) throw new Error('Could not sign out. Please try again.');
    window.location.assign('login.html');
  } catch (error) { showToast(error.message); }
}));

api('/api/management/me').then(({ user }) => {
  if (user.role !== 'student') {
    window.location.replace(user.role === 'admin' ? 'admin.html' : 'teacher.html');
    return;
  }
  return loadPortal();
}).catch(() => window.location.replace('login.html'));
