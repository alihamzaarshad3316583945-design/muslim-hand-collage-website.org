const api = async (url, options = {}) => {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));
const localDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const initials = (name) => String(name || 'MH').split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase();
const toast = document.querySelector('[data-toast]');
let toastTimer;
let users = [];
let classes = [];
let timetableEntries = [];
let settings = { currency: 'PKR' };
const scrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const views = {
  overview: ['Overview', 'Key information from your college records.'],
  users: ['Students & staff', 'Manage college accounts and access.'],
  admissions: ['Admissions', 'Review and follow up on submitted admission inquiries.'],
  classes: ['Classes', 'Organize classes and teacher assignments.'],
  attendance: ['Attendance', 'Record and review daily class attendance.'],
  fees: ['Fees', 'Track fee schedules, payments, and balances.'],
  results: ['Results', 'Publish exam scores to student accounts.'],
  notices: ['Notices', 'Share announcements with college members.'],
  timetable: ['Timetable', 'Maintain the weekly class schedule.'],
  activity: ['Activity log', 'Review administrative changes.'],
  settings: ['Website settings', 'Manage college identity and the academic year.'],
  transfer: ['Transfer administrator', 'Securely hand over administrative ownership.']
};

const showToast = (message, isError = false) => {
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 4200);
};

const setEmpty = (selector, columns, message) => {
  document.querySelector(selector).innerHTML = `<tr><td class="empty-state" colspan="${columns}">${escapeHtml(message)}</td></tr>`;
};

const money = (cents) => {
  const amount = (Number(cents || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${escapeHtml(settings.currency || 'PKR')} ${amount}`;
};

const metricFrames = new WeakMap();
const setAnimatedCount = (element, value) => {
  const target = Number(value);
  if (!Number.isFinite(target)) return;
  const previousFrame = metricFrames.get(element);
  if (previousFrame) window.cancelAnimationFrame(previousFrame);
  const start = Number(element.dataset.metricValue || 0);
  element.dataset.metricValue = String(target);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || start === target) {
    element.textContent = target.toLocaleString();
    return;
  }
  const startTime = performance.now();
  const duration = 720;
  const tick = (now) => {
    const progress = Math.min(1, (now - startTime) / duration);
    const eased = 1 - (1 - progress) ** 4;
    element.textContent = Math.round(start + (target - start) * eased).toLocaleString();
    if (progress < 1) metricFrames.set(element, window.requestAnimationFrame(tick));
    else {
      element.textContent = target.toLocaleString();
      metricFrames.delete(element);
    }
  };
  metricFrames.set(element, window.requestAnimationFrame(tick));
};

const setOptions = (selector, items, placeholder, format) => {
  document.querySelectorAll(selector).forEach((select) => {
    const previous = select.value;
    select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>${items.map(format).join('')}`;
    if (items.some((item) => String(item.id) === previous)) select.value = previous;
  });
};

const loadClasses = async () => {
  const [classData, userData] = await Promise.all([api('/api/management/classes'), api('/api/management/users')]);
  classes = classData.classes;
  users = userData.users;
  const students = users.filter((user) => user.role === 'student' && user.status !== 'deleted');
  const teachers = users.filter((user) => user.role === 'teacher' && user.status === 'active');
  setOptions('[data-class-options], [data-attendance-class], [data-timetable-class]', classes,
    'Select a class', (item) => `<option value="${item.id}">${escapeHtml(item.name)}${item.code ? ` · ${escapeHtml(item.code)}` : ''}</option>`);
  setOptions('[data-teacher-options]', teachers, 'Unassigned',
    (item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`);
  setOptions('[data-student-options]', students, 'Select a student',
    (item) => `<option value="${item.id}">${escapeHtml(item.name)}${item.studentNumber ? ` · ${escapeHtml(item.studentNumber)}` : ''}</option>`);
  return { classes, users };
};

const renderActivity = (container, entries, emptyText) => {
  if (!entries.length) {
    container.innerHTML = `<p class="empty-state">${escapeHtml(emptyText)}</p>`;
    return;
  }
  container.innerHTML = entries.map((entry) => {
    const detail = Object.values(entry.details || {}).filter(Boolean).join(' · ');
    const date = new Date(`${entry.createdAt.replace(' ', 'T')}Z`);
    const dateText = Number.isNaN(date.getTime()) ? entry.createdAt : date.toLocaleString();
    return `<div class="activity-row"><span class="activity-dot">↻</span><div class="activity-copy"><strong>${escapeHtml(entry.actorName || 'Former account')} ${escapeHtml(entry.action)} ${escapeHtml(entry.entity.replaceAll('_', ' '))}</strong><small>${escapeHtml(detail)}</small></div><time>${escapeHtml(dateText)}</time></div>`;
  }).join('');
};

const loadOverview = async () => {
  const data = await api('/api/management/overview');
  for (const key of ['students', 'teachers', 'classes', 'markedToday']) {
    setAnimatedCount(document.querySelector(`[data-stat="${key}"]`), Number(data[key] || 0));
  }
  document.querySelector('[data-stat="feesOutstanding"]').textContent = money(data.feesOutstanding);
  const chart = document.querySelector('[data-attendance-chart]');
  if (!data.attendance.length) {
    chart.innerHTML = '<div class="chart-empty">Attendance reports will appear when records are entered.</div>';
  } else {
    const values = data.attendance.map((month) => Number(month.rate || 0));
    const max = Math.max(100, ...values);
    chart.innerHTML = data.attendance.map((month) => {
      const monthName = new Date(`${month.month}-01T00:00:00`).toLocaleDateString(undefined, { month: 'short' });
      return `<div class="chart-column" title="${escapeHtml(monthName)}: ${Number(month.rate).toFixed(1)}%"><div class="chart-bar" style="height:${Math.max(3, (Number(month.rate) / max) * 100)}%" aria-label="${Number(month.rate).toFixed(1)} percent"></div><small>${escapeHtml(monthName)}</small></div>`;
    }).join('');
  }
  renderActivity(document.querySelector('[data-recent-activity]'), data.recentActivity, 'No management activity has been recorded yet.');
};

const loadUsers = async () => {
  const data = await api('/api/management/users');
  users = data.users;
  const visibleUsers = users.filter((user) => !document.querySelector('[data-user-filter]').value || user.role === document.querySelector('[data-user-filter]').value);
  const activeUsers = users.filter((user) => user.status !== 'deleted');
  setOptions('[data-student-options]', activeUsers.filter((user) => user.role === 'student'), 'Select a student',
    (item) => `<option value="${item.id}">${escapeHtml(item.name)}${item.studentNumber ? ` · ${escapeHtml(item.studentNumber)}` : ''}</option>`);
  const body = document.querySelector('[data-users-table]');
  if (!visibleUsers.length) return setEmpty('[data-users-table]', 5, 'No matching student or teacher accounts.');
  body.innerHTML = visibleUsers.map((user) => {
    const place = user.role === 'student' ? (user.className || user.studentNumber || 'Not assigned') : 'College staff';
    const statusButton = user.status === 'deleted'
      ? ''
      : `<button class="row-action" data-action="status-user" data-id="${user.id}" data-status="${user.status === 'active' ? 'suspended' : 'active'}">${user.status === 'active' ? 'Suspend' : 'Activate'}</button>`;
    const removeButton = user.status === 'deleted' ? '' : `<button class="row-action danger" data-action="delete-user" data-id="${user.id}">Delete</button>`;
    return `<tr><td class="person-cell"><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.username || user.email)}</small></td><td><span class="status-pill">${escapeHtml(user.role)}</span></td><td>${escapeHtml(place)}</td><td><span class="status-pill ${escapeHtml(user.status)}">${escapeHtml(user.status)}</span></td><td><div class="row-actions">${user.status === 'deleted' ? '' : `<button class="row-action" data-action="edit-user" data-id="${user.id}">Edit</button>`}${statusButton}${removeButton}</div></td></tr>`;
  }).join('');
};

const loadClassTable = async () => {
  const result = await api('/api/management/classes');
  classes = result.classes;
  const tbody = document.querySelector('[data-classes-table]');
  if (!classes.length) return setEmpty('[data-classes-table]', 6, 'No classes have been created.');
  tbody.innerHTML = classes.map((item) => `<tr><td><strong>${escapeHtml(item.name)}</strong></td><td>${escapeHtml(item.code)}</td><td>${escapeHtml(item.academicYear || '—')}</td><td>${escapeHtml(item.teacherName || 'Unassigned')}</td><td>${Number(item.studentCount)}</td><td><div class="row-actions"><button class="row-action" data-action="edit-class" data-id="${item.id}">Edit</button><button class="row-action danger" data-action="delete-class" data-id="${item.id}">Delete</button></div></td></tr>`).join('');
};

const loadAttendance = async () => {
  const classId = document.querySelector('[data-attendance-class]').value;
  const date = document.querySelector('[data-attendance-date]').value;
  const search = document.querySelector('[data-attendance-search]').value.trim();
  const query = new URLSearchParams({ date });
  if (classId) query.set('classId', classId);
  if (search) query.set('search', search);
  const result = await api(`/api/management/attendance?${query}`);
  const tbody = document.querySelector('[data-attendance-table]');
  if (!result.records.length) return setEmpty('[data-attendance-table]', 3, 'There are no active students in this class.');
  tbody.innerHTML = result.records.map((record) => `<tr><td class="person-cell"><strong>${escapeHtml(record.name)}</strong></td><td>${escapeHtml(record.studentNumber || '—')}</td><td><select class="table-input" name="attendance-${record.studentId}" data-attendance-status="${record.studentId}"><option value="present" ${record.status === 'present' || !record.status ? 'selected' : ''}>Present</option><option value="absent" ${record.status === 'absent' ? 'selected' : ''}>Absent</option><option value="late" ${record.status === 'late' ? 'selected' : ''}>Late</option></select></td></tr>`).join('');
  document.querySelector('[data-form="attendance"]').dataset.loadedClassId = classId || '';
  document.querySelector('[data-form="attendance"]').dataset.loadedDate = date;
};

const loadFees = async () => {
  const result = await api('/api/management/fees');
  const tbody = document.querySelector('[data-fees-table]');
  if (!result.fees.length) return setEmpty('[data-fees-table]', 7, 'No fee records yet.');
  tbody.innerHTML = result.fees.map((fee) => `<tr><td><strong>${escapeHtml(fee.studentName)}</strong></td><td><input class="table-input" value="${escapeHtml(fee.label)}" maxlength="100" data-fee-label="${fee.id}" aria-label="Fee description"></td><td><input class="table-input" type="number" min="0.01" step="0.01" value="${(fee.amountCents / 100).toFixed(2)}" data-fee-amount="${fee.id}" aria-label="Fee total"></td><td><input class="table-input" type="number" min="0" max="${(fee.amountCents / 100).toFixed(2)}" step="0.01" value="${(fee.paidCents / 100).toFixed(2)}" data-paid-amount="${fee.id}" aria-label="Paid amount for ${escapeHtml(fee.label)}"></td><td>${money(fee.balanceCents)}</td><td><input class="table-input" type="date" value="${escapeHtml(fee.dueDate)}" data-fee-due="${fee.id}" aria-label="Fee due date"></td><td><span class="status-pill ${escapeHtml(fee.status)}">${escapeHtml(fee.status)}</span><button class="row-action" data-action="save-fee" data-id="${fee.id}">Save</button></td></tr>`).join('');
};

const loadResults = async () => {
  const result = await api('/api/management/results');
  const tbody = document.querySelector('[data-results-table]');
  if (!result.results.length) return setEmpty('[data-results-table]', 6, 'No exam results have been published.');
  tbody.innerHTML = result.results.map((item) => `<tr><td><strong>${escapeHtml(item.studentName)}</strong></td><td>${escapeHtml(item.examName)}</td><td>${escapeHtml(item.subject)}</td><td>${Number(item.score)} / ${Number(item.maximumScore)}</td><td><span class="status-pill ${item.percentage >= 50 ? 'active' : 'absent'}">${Number(item.percentage).toFixed(1)}%</span></td><td><div class="row-actions"><input class="table-input" type="number" min="0" max="100000" step="0.01" value="${Number(item.score)}" data-result-score="${item.id}" aria-label="Score for ${escapeHtml(item.subject)}"><input class="table-input" type="number" min="0.01" max="100000" step="0.01" value="${Number(item.maximumScore)}" data-result-max="${item.id}" aria-label="Maximum score"><button class="row-action" data-action="save-result" data-id="${item.id}">Save</button><button class="row-action danger" data-action="delete-result" data-id="${item.id}">Delete</button></div></td></tr>`).join('');
};

const loadReport = async () => {
  const month = document.querySelector('[data-report-month]').value;
  if (!month) return showToast('Choose a month to run the report.', true);
  const classId = document.querySelector('[data-attendance-class]').value;
  const query = new URLSearchParams({ month });
  if (classId) query.set('classId', classId);
  const search = document.querySelector('[data-report-search]').value.trim();
  if (search) query.set('search', search);
  const { summary, rows } = await api(`/api/management/attendance/reports?${query}`);
  document.querySelector('[data-report-summary]').textContent = `${summary.recordedDays} recorded marks · ${summary.present} present · ${summary.late} late · ${summary.absent} absent`;
  const tbody = document.querySelector('[data-report-table]');
  if (!rows.length) return setEmpty('[data-report-table]', 7, 'No attendance records were found for this month and class.');
  tbody.innerHTML = rows.map((row) => `<tr><td><strong>${escapeHtml(row.studentName)}</strong></td><td>${escapeHtml(row.className)}</td><td>${Number(row.recordedDays)}</td><td>${Number(row.present)}</td><td>${Number(row.late)}</td><td>${Number(row.absent)}</td><td><span class="status-pill ${row.rate >= 75 ? 'active' : 'absent'}">${Number(row.rate).toFixed(1)}%</span></td></tr>`).join('');
};

const loadNotices = async () => {
  const { notices } = await api('/api/management/notices');
  const container = document.querySelector('[data-notices]');
  container.innerHTML = notices.length ? notices.map((notice) => `<article class="notice-card"><div class="notice-top"><h3>${escapeHtml(notice.title)}</h3><span class="notice-audience">${escapeHtml(notice.audience)}</span><div class="row-actions"><button class="row-action" data-action="edit-notice" data-id="${notice.id}">Edit</button><button class="row-action danger" data-action="delete-notice" data-id="${notice.id}">Delete</button></div></div><p>${escapeHtml(notice.body)}</p><small>${escapeHtml(new Date(`${notice.createdAt.replace(' ', 'T')}Z`).toLocaleString())}</small></article>`).join('') : '<p class="empty-state">No notices have been published.</p>';
};

const loadTimetable = async () => {
  const classId = document.querySelector('[data-timetable-class]').value;
  const { timetable } = await api(`/api/management/timetable${classId ? `?classId=${encodeURIComponent(classId)}` : ''}`);
  timetableEntries = timetable;
  const tbody = document.querySelector('[data-timetable-table]');
  if (!timetable.length) return setEmpty('[data-timetable-table]', 6, 'No timetable entries have been added.');
  tbody.innerHTML = timetable.map((item) => `<tr><td>${dayNames[item.weekday - 1]}</td><td>${escapeHtml(item.startTime)}–${escapeHtml(item.endTime)}</td><td>${escapeHtml(item.className)}</td><td><strong>${escapeHtml(item.subject)}</strong></td><td>${escapeHtml(item.room || '—')}</td><td><div class="row-actions"><button class="row-action" data-action="edit-timetable" data-id="${item.id}">Edit</button><button class="row-action danger" data-action="delete-timetable" data-id="${item.id}">Delete</button></div></td></tr>`).join('');
};

const loadActivity = async () => {
  const { logs } = await api('/api/management/activity');
  renderActivity(document.querySelector('[data-activity-list]'), logs, 'No management activity has been recorded yet.');
};

const loadSettings = async () => {
  const result = await api('/api/management/settings');
  settings = result.settings;
  const form = document.querySelector('[data-form="settings"]');
  for (const [key, value] of Object.entries(settings)) {
    const field = form.elements.namedItem(key);
    if (field) field.value = value;
  }
};

const refreshOptions = async () => {
  await loadClasses();
  await loadClassTable();
  await loadUsers();
  await loadSettings();
};

const loadAdmissions = async () => {
  const { admissions } = await api('/api/management/admissions');
  const body = document.querySelector('[data-admissions-table]');
  if (!admissions.length) return setEmpty('[data-admissions-table]', 6, 'No admission inquiries have been submitted.');
  const options = ['received', 'reviewing', 'contacted', 'accepted', 'declined'];
  body.innerHTML = admissions.map((item) => `<tr>
    <td class="person-cell"><strong>${escapeHtml(item.fullName)}</strong>${item.guardianName ? `<small>Guardian: ${escapeHtml(item.guardianName)}</small>` : ''}</td>
    <td>${escapeHtml(item.phone)}${item.email ? `<small class="sub-cell">${escapeHtml(item.email)}</small>` : ''}</td>
    <td>${escapeHtml(item.program)}</td>
    <td class="admission-message">${escapeHtml(item.message || '—')}</td>
    <td>${escapeHtml(item.createdAt)}</td>
    <td><select class="compact-select" data-admission-status="${item.id}" aria-label="Admission status for ${escapeHtml(item.fullName)}">${options.map((status) => `<option value="${status}" ${status === item.status ? 'selected' : ''}>${status[0].toUpperCase()}${status.slice(1)}</option>`).join('')}</select></td>
  </tr>`).join('');
};

const csvValue = (value) => {
  let text = String(value ?? '').replace(/\r?\n/g, ' ').trim();
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

const downloadTableCsv = (selector, filename) => {
  const table = document.querySelector(selector);
  const rows = Array.from(table.querySelectorAll('tr'))
    .filter((row) => !row.querySelector('.empty-state'))
    .map((row) => Array.from(row.cells).map((cell) => {
      const input = cell.querySelector('input, select');
      return csvValue(input ? input.value : cell.innerText);
    }).join(','));
  if (!rows.length) return showToast('There are no report rows to export.', true);
  const blob = new Blob([`\uFEFF${rows.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
};

const loadView = async (view) => {
  try {
    if (view === 'overview') await loadOverview();
    if (view === 'users') { await refreshOptions(); }
    if (view === 'admissions') await loadAdmissions();
    if (view === 'classes') { await refreshOptions(); }
    if (view === 'attendance') { await loadClasses(); }
    if (view === 'fees') { await loadClasses(); await loadUsers(); await loadFees(); }
    if (view === 'results') { await loadUsers(); await loadResults(); }
    if (view === 'notices') await loadNotices();
    if (view === 'timetable') { await loadClasses(); await loadTimetable(); }
    if (view === 'activity') await loadActivity();
    if (view === 'settings') await loadSettings();
  } catch (error) {
    showToast(error.message, true);
  }
};

const openView = (view) => {
  if (!views[view]) return;
  document.querySelectorAll('[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  document.querySelectorAll('[data-panel]').forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === view));
  document.querySelector('[data-page-title]').textContent = views[view][0];
  document.querySelector('[data-page-subtitle]').textContent = views[view][1];
  document.querySelector('.sidebar').classList.remove('open');
  loadView(view);
};

const submitForm = async (form, url, method, successMessage, refresh) => {
  const submitButton = form.querySelector('button[type="submit"]');
  const originalLabel = submitButton.textContent;
  const wasEditing = Boolean(form.dataset.editId);
  submitButton.disabled = true;
  try {
    const data = Object.fromEntries(new FormData(form).entries());
    await api(url, { method, body: JSON.stringify(data) });
    form.reset();
    if (form.matches('[data-form="create-user"]')) updateUserRoleFields('student');
    if (wasEditing) {
      delete form.dataset.editId;
      submitButton.textContent = form.matches('[data-form="create-class"]')
        ? 'Add class'
        : form.matches('[data-form="create-notice"]') ? 'Publish notice' : 'Add to timetable';
    }
    showToast(successMessage);
    if (refresh) await refresh();
  } catch (error) {
    showToast(error.message, true);
  } finally {
    submitButton.disabled = false;
    if (submitButton.isConnected) submitButton.textContent = originalLabel;
  }
};

document.querySelector('[data-today]').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
document.querySelector('[data-attendance-date]').value = localDate();
document.querySelector('[data-report-month]').value = localDate().slice(0, 7);
document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => openView(button.dataset.view)));
document.querySelectorAll('[data-open-view]').forEach((button) => button.addEventListener('click', (event) => {
  event.preventDefault();
  openView(button.dataset.openView);
}));
document.querySelector('[data-menu]').addEventListener('click', () => document.querySelector('.sidebar').classList.toggle('open'));
document.querySelector('[data-user-filter]').addEventListener('change', loadUsers);
document.querySelector('[data-load-attendance]').addEventListener('click', loadAttendance);
document.querySelector('[data-load-report]').addEventListener('click', loadReport);
document.querySelector('[data-export-attendance]').addEventListener('click', () => downloadTableCsv('[data-attendance-table]', 'daily-attendance.csv'));
document.querySelector('[data-export-report]').addEventListener('click', () => downloadTableCsv('[data-report-table]', 'monthly-attendance.csv'));
document.addEventListener('change', async (event) => {
  const field = event.target.closest('[data-admission-status]');
  if (!field) return;
  field.disabled = true;
  try {
    await api(`/api/management/admissions/${field.dataset.admissionStatus}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: field.value })
    });
    showToast('Admission inquiry status updated.');
  } catch (error) {
    showToast(error.message, true);
    await loadAdmissions();
  } finally {
    field.disabled = false;
  }
});
document.querySelector('[data-timetable-class]').addEventListener('change', loadTimetable);
document.querySelector('[data-close-dialog]').addEventListener('click', () => document.querySelector('[data-edit-dialog]').close());
document.querySelector('[data-edit-dialog]').addEventListener('click', (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});
const updateUserRoleFields = (role) => {
  document.querySelectorAll('[data-student-field]').forEach((field) => { field.hidden = role !== 'student'; });
  document.querySelector('[data-form="create-user"] [name="username"]').required = role === 'teacher';
};
document.querySelector('[data-form="create-user"] [name="role"]').addEventListener('change', (event) => updateUserRoleFields(event.target.value));
updateUserRoleFields(document.querySelector('[data-form="create-user"] [name="role"]').value);

document.querySelector('[data-form="create-user"]').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  submitForm(form, '/api/management/users', 'POST', 'Account created.', async () => {
    await refreshOptions();
    openView('users');
  });
});

document.querySelector('[data-form="edit-user"]').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const id = form.elements.namedItem('id').value;
  await submitForm(form, `/api/management/users/${id}`, 'PATCH', 'Account updated.', async () => {
    document.querySelector('[data-edit-dialog]').close();
    await refreshOptions();
    openView('users');
  });
});

document.querySelector('[data-form="create-class"]').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const id = form.dataset.editId;
  submitForm(form, id ? `/api/management/classes/${id}` : '/api/management/classes', id ? 'PATCH' : 'POST',
    id ? 'Class updated.' : 'Class created.', async () => { await refreshOptions(); openView('classes'); });
});

document.querySelector('[data-form="attendance"]').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.dataset.loadedClassId || !form.querySelector('[data-attendance-status]')) return showToast('Load a class roster before saving attendance.', true);
  const entries = Array.from(form.querySelectorAll('[data-attendance-status]')).map((select) => ({
    studentId: Number(select.dataset.attendanceStatus),
    status: select.value
  }));
  try {
    const result = await api('/api/management/attendance', {
      method: 'POST',
      body: JSON.stringify({ classId: Number(form.dataset.loadedClassId), date: form.dataset.loadedDate, entries })
    });
    showToast(`Saved ${result.saved} attendance records.`);
    await loadOverview();
  } catch (error) { showToast(error.message, true); }
});

document.querySelector('[data-form="create-fee"]').addEventListener('submit', (event) => {
  event.preventDefault();
  submitForm(event.currentTarget, '/api/management/fees', 'POST', 'Fee record added.', loadFees);
});
document.querySelector('[data-form="create-result"]').addEventListener('submit', (event) => {
  event.preventDefault();
  submitForm(event.currentTarget, '/api/management/results', 'POST', 'Exam result published.', loadResults);
});
document.querySelector('[data-form="create-notice"]').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const id = form.dataset.editId;
  submitForm(form, id ? `/api/management/notices/${id}` : '/api/management/notices',
    id ? 'PATCH' : 'POST', id ? 'Notice updated.' : 'Notice published.', loadNotices);
});
document.querySelector('[data-form="create-timetable"]').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const id = form.dataset.editId;
  submitForm(form, id ? `/api/management/timetable/${id}` : '/api/management/timetable',
    id ? 'PATCH' : 'POST', id ? 'Timetable entry updated.' : 'Timetable entry added.', loadTimetable);
});
document.querySelector('[data-form="settings"]').addEventListener('submit', (event) => {
  event.preventDefault();
  submitForm(event.currentTarget, '/api/management/settings', 'PUT', 'College settings saved.', loadSettings);
});

document.querySelector('[data-form="transfer"]').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!window.confirm('Transfer administrator ownership now? Your account will become a teacher.')) return;
  const form = event.currentTarget;
  try {
    const data = Object.fromEntries(new FormData(form).entries());
    const result = await api('/api/management/transfer-admin', { method: 'POST', body: JSON.stringify(data) });
    showToast(`Administrator ownership transferred to ${result.newAdmin.name}.`);
    window.setTimeout(() => { window.location.assign('teacher.html'); }, 1200);
  } catch (error) { showToast(error.message, true); }
});

document.addEventListener('click', async (event) => {
  const action = event.target.closest('[data-action]');
  if (!action) return;
  const id = Number(action.dataset.id);
  try {
    if (action.dataset.action === 'edit-user') {
      const user = users.find((item) => item.id === id);
      if (!user) throw new Error('Account is no longer available.');
      const form = document.querySelector('[data-form="edit-user"]');
      for (const [key, value] of Object.entries({
        id: user.id, fullName: user.name, username: user.username || '',
        email: user.email, phone: user.phone || '', studentNumber: user.studentNumber || '',
        classId: user.classId || '', password: ''
      })) form.elements.namedItem(key).value = value;
      document.querySelectorAll('[data-edit-student-field]').forEach((field) => { field.hidden = user.role !== 'student'; });
      document.querySelector('[data-edit-dialog]').showModal();
      return;
    }
    if (action.dataset.action === 'status-user') {
      const status = action.dataset.status;
      if (!window.confirm(`${status === 'suspended' ? 'Suspend' : 'Reactivate'} this account?`)) return;
      await api(`/api/management/users/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      showToast(`Account ${status === 'suspended' ? 'suspended' : 'reactivated'}.`);
      await refreshOptions();
      return;
    }
    if (action.dataset.action === 'delete-user') {
      if (!window.confirm('Remove this account? Its attendance, fee, and result records will be retained for school records.')) return;
      await api(`/api/management/users/${id}`, { method: 'DELETE' });
      showToast('Account removed; historical records retained.');
      await refreshOptions();
      return;
    }
    if (action.dataset.action === 'edit-class') {
      const item = classes.find((entry) => entry.id === id);
      if (!item) throw new Error('Class is no longer available.');
      const form = document.querySelector('[data-form="create-class"]');
      for (const [key, value] of Object.entries({ name: item.name, code: item.code, academicYear: item.academicYear, teacherId: item.teacherId || '' })) {
        form.elements.namedItem(key).value = value;
      }
      form.dataset.editId = id;
      form.querySelector('button[type="submit"]').textContent = 'Save class changes';
      form.scrollIntoView({ behavior: scrollBehavior, block: 'center' });
      form.elements.namedItem('name').focus();
      return;
    }
    if (action.dataset.action === 'delete-class') {
      if (!window.confirm('Delete this class? Classes with students or historical records cannot be deleted.')) return;
      await api(`/api/management/classes/${id}`, { method: 'DELETE' });
      showToast('Class deleted.');
      await refreshOptions();
      return;
    }
    if (action.dataset.action === 'save-fee') {
      const paidAmount = document.querySelector(`[data-paid-amount="${id}"]`).value;
      const amount = document.querySelector(`[data-fee-amount="${id}"]`).value;
      const label = document.querySelector(`[data-fee-label="${id}"]`).value;
      const dueDate = document.querySelector(`[data-fee-due="${id}"]`).value;
      await api(`/api/management/fees/${id}`, { method: 'PATCH', body: JSON.stringify({ label, amount, paidAmount, dueDate }) });
      showToast('Fee payment updated.');
      await loadFees();
      return;
    }
    if (action.dataset.action === 'save-result') {
      const score = document.querySelector(`[data-result-score="${id}"]`).value;
      const maximumScore = document.querySelector(`[data-result-max="${id}"]`).value;
      await api(`/api/management/results/${id}`, { method: 'PATCH', body: JSON.stringify({ score, maximumScore }) });
      showToast('Exam result updated.');
      await loadResults();
      return;
    }
    if (action.dataset.action === 'delete-result') {
      if (!window.confirm('Delete this exam result?')) return;
      await api(`/api/management/results/${id}`, { method: 'DELETE' });
      showToast('Result deleted.');
      await loadResults();
      return;
    }
    if (action.dataset.action === 'delete-notice') {
      if (!window.confirm('Delete this notice for all recipients?')) return;
      await api(`/api/management/notices/${id}`, { method: 'DELETE' });
      showToast('Notice deleted.');
      await loadNotices();
      return;
    }
    if (action.dataset.action === 'edit-notice') {
      const { notices } = await api('/api/management/notices');
      const notice = notices.find((entry) => entry.id === id);
      if (!notice) throw new Error('Notice is no longer available.');
      const form = document.querySelector('[data-form="create-notice"]');
      form.elements.namedItem('title').value = notice.title;
      form.elements.namedItem('body').value = notice.body;
      form.elements.namedItem('audience').value = notice.audience;
      form.dataset.editId = id;
      form.querySelector('button[type="submit"]').textContent = 'Save notice changes';
      form.scrollIntoView({ behavior: scrollBehavior, block: 'center' });
      form.elements.namedItem('title').focus();
      return;
    }
    if (action.dataset.action === 'edit-timetable') {
      const item = timetableEntries.find((entry) => entry.id === id);
      if (!item) throw new Error('Timetable entry is no longer available.');
      const form = document.querySelector('[data-form="create-timetable"]');
      for (const [key, value] of Object.entries({
        classId: item.classId, weekday: item.weekday, startTime: item.startTime,
        endTime: item.endTime, subject: item.subject, room: item.room
      })) form.elements.namedItem(key).value = value;
      form.dataset.editId = id;
      form.querySelector('button[type="submit"]').textContent = 'Save timetable changes';
      form.scrollIntoView({ behavior: scrollBehavior, block: 'center' });
      form.elements.namedItem('subject').focus();
      return;
    }
    if (action.dataset.action === 'delete-timetable') {
      if (!window.confirm('Delete this timetable entry?')) return;
      await api(`/api/management/timetable/${id}`, { method: 'DELETE' });
      showToast('Timetable entry deleted.');
      await loadTimetable();
    }
  } catch (error) { showToast(error.message, true); }
});

document.querySelectorAll('[data-logout]').forEach((button) => button.addEventListener('click', async () => {
  try {
    const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    if (!response.ok) throw new Error('Could not sign out. Please try again.');
    window.location.assign('login.html');
  } catch (error) { showToast(error.message, true); }
}));

api('/api/management/me').then(({ user }) => {
  if (user.role !== 'admin') {
    window.location.replace(user.role === 'student' ? 'student.html' : 'teacher.html');
    return;
  }
  document.querySelectorAll('[data-user-name]').forEach((node) => { node.textContent = user.name; });
  document.querySelectorAll('[data-avatar]').forEach((node) => { node.textContent = initials(user.name); });
  openView('overview');
}).catch(() => window.location.replace('login.html'));
