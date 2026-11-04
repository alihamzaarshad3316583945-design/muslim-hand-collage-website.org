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
const showToast = (message, error = false) => {
  toast.textContent = message;
  toast.classList.toggle('error', error);
  toast.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 4200);
};
const localDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const initials = (name) => String(name || 'TC').split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase();
const emptyRoster = (message) => { document.querySelector('[data-roster]').innerHTML = `<tr><td colspan="3" class="empty-state">${escapeHtml(message)}</td></tr>`; };
let assignments = [];
document.querySelector('[data-date]').value = localDate();
document.querySelector('[data-today]').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

document.querySelector('[data-menu]').addEventListener('click', () => document.querySelector('.sidebar').classList.toggle('open'));
document.querySelectorAll('[data-scroll]').forEach((button) => button.addEventListener('click', () => {
  document.getElementById(button.dataset.scroll).scrollIntoView({ behavior: scrollBehavior });
  document.querySelector('.sidebar').classList.remove('open');
}));

const loadRoster = async () => {
  const classId = document.querySelector('[data-class]').value;
  if (!classId) return showToast('Choose an assigned class first.', true);
  const date = document.querySelector('[data-date]').value;
  const search = document.querySelector('[data-attendance-search]').value.trim();
  const query = new URLSearchParams({ classId, date });
  if (search) query.set('search', search);
  try {
    const { records } = await api(`/api/management/attendance?${query}`);
    if (!records.length) {
      emptyRoster(search ? 'No students match your search.' : 'There are no active students in this class.');
      document.querySelector('[data-attendance-form]').dataset.loadedClassId = '';
      return;
    }
    document.querySelector('[data-roster]').innerHTML = records.map((record) => `<tr><td><strong>${escapeHtml(record.name)}</strong></td><td>${escapeHtml(record.studentNumber || '—')}</td><td><select class="table-input" data-student-status="${record.studentId}" aria-label="Attendance for ${escapeHtml(record.name)}"><option value="present" ${record.status === 'present' || !record.status ? 'selected' : ''}>Present</option><option value="absent" ${record.status === 'absent' ? 'selected' : ''}>Absent</option><option value="late" ${record.status === 'late' ? 'selected' : ''}>Late</option></select></td></tr>`).join('');
    const form = document.querySelector('[data-attendance-form]');
    form.dataset.loadedClassId = classId;
    form.dataset.loadedDate = date;
  } catch (error) { showToast(error.message, true); }
};

document.querySelector('[data-load]').addEventListener('click', loadRoster);
document.querySelector('[data-export-attendance]').addEventListener('click', () => {
  const table = document.querySelector('[data-roster]').closest('table');
  const rows = Array.from(table.querySelectorAll('tr')).filter((row) => !row.querySelector('.empty-state')).map((row) =>
    Array.from(row.cells).map((cell) => {
      const field = cell.querySelector('select');
      let value = field ? field.value : cell.innerText.trim();
      if (/^[\s]*[=+\-@]/.test(value)) value = `'${value}`;
      return `"${value.replace(/"/g, '""')}"`;
    }).join(',')
  );
  if (!rows.length) return showToast('Load attendance records before exporting.', true);
  const csv = `\uFEFF${['Student,Student number,Attendance', ...rows].join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `class-attendance-${document.querySelector('[data-date]').value}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
});
document.querySelector('[data-attendance-form]').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const entries = Array.from(form.querySelectorAll('[data-student-status]')).map((select) => ({
    studentId: Number(select.dataset.studentStatus), status: select.value
  }));
  if (!form.dataset.loadedClassId || !entries.length) return showToast('Load the class roster before saving attendance.', true);
  try {
    const result = await api('/api/management/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classId: Number(form.dataset.loadedClassId), date: form.dataset.loadedDate, entries })
    });
    showToast(`Saved ${result.saved} attendance records.`);
  } catch (error) { showToast(error.message, true); }
});

const loadAssignments = async () => {
  const { assignments: items } = await api('/api/management/assignments');
  assignments = items;
  const container = document.querySelector('[data-teacher-assignments]');
  container.innerHTML = items.length ? items.map((item) => `<article class="notice-card">
    <div class="notice-top"><h3>${escapeHtml(item.title)}</h3><span class="notice-audience">${escapeHtml(item.className)} · Due ${escapeHtml(item.dueDate)}</span></div>
    <p>${escapeHtml(item.description)}</p><div class="row-actions">
      <button class="row-action" type="button" data-assignment-action="edit" data-id="${item.id}">Edit</button>
      <button class="row-action danger" type="button" data-assignment-action="delete" data-id="${item.id}">Delete</button>
    </div></article>`).join('') : '<p class="empty-state">No assignments have been published.</p>';
};

const assignmentForm = document.querySelector('[data-assignment-form]');
assignmentForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = assignmentForm.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    const payload = Object.fromEntries(new FormData(assignmentForm).entries());
    const editingId = assignmentForm.dataset.editId;
    await api(editingId ? `/api/management/assignments/${editingId}` : '/api/management/assignments', {
      method: editingId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    assignmentForm.reset();
    delete assignmentForm.dataset.editId;
    button.textContent = 'Publish assignment';
    showToast(editingId ? 'Assignment updated.' : 'Assignment published.');
    await loadAssignments();
  } catch (error) { showToast(error.message, true); }
  finally { button.disabled = false; }
});

document.querySelector('[data-teacher-assignments]').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-assignment-action]');
  if (!button) return;
  const item = assignments.find((assignment) => assignment.id === Number(button.dataset.id));
  if (!item) return showToast('That assignment is no longer available. Refresh and try again.', true);
  if (button.dataset.assignmentAction === 'edit') {
    assignmentForm.elements.classId.value = String(item.classId);
    assignmentForm.elements.title.value = item.title;
    assignmentForm.elements.description.value = item.description;
    assignmentForm.elements.dueDate.value = item.dueDate;
    assignmentForm.dataset.editId = item.id;
    assignmentForm.querySelector('[type="submit"]').textContent = 'Save changes';
    assignmentForm.scrollIntoView({ behavior: scrollBehavior, block: 'center' });
    return;
  }
  if (!window.confirm(`Delete "${item.title}"? This cannot be undone.`)) return;
  button.disabled = true;
  try {
    await api(`/api/management/assignments/${item.id}`, { method: 'DELETE' });
    showToast('Assignment deleted.');
    await loadAssignments();
  } catch (error) { showToast(error.message, true); }
  finally { button.disabled = false; }
});

const loadResultStudents = async () => {
  const classId = document.querySelector('[data-results-class]').value;
  const select = document.querySelector('[data-result-student]');
  if (!classId) {
    select.innerHTML = '<option value="">Choose a class first</option>';
    return;
  }
  try {
    const { records } = await api(`/api/management/attendance?classId=${encodeURIComponent(classId)}`);
    select.innerHTML = `<option value="">Select a student</option>${records.map((record) => `<option value="${record.studentId}">${escapeHtml(record.name)}${record.studentNumber ? ` · ${escapeHtml(record.studentNumber)}` : ''}</option>`).join('')}`;
    if (!records.length) select.innerHTML = '<option value="">No active students in this class</option>';
  } catch (error) { showToast(error.message, true); }
};

const loadTeacherResults = async () => {
  const { results } = await api('/api/management/results');
  const body = document.querySelector('[data-teacher-results]');
  body.innerHTML = results.length ? results.map((item) => `<tr><td>${escapeHtml(item.studentName)}</td><td>${escapeHtml(item.examName)}</td><td>${escapeHtml(item.subject)}</td><td>${Number(item.score)} / ${Number(item.maximumScore)}</td><td>${Number(item.percentage).toFixed(1)}%</td></tr>`).join('') : '<tr><td colspan="5" class="empty-state">No examination marks have been published.</td></tr>';
};

document.querySelector('[data-results-class]').addEventListener('change', loadResultStudents);
document.querySelector('[data-marks-form]').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    const values = Object.fromEntries(new FormData(form).entries());
    await api('/api/management/results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values)
    });
    showToast('Examination marks published to the student record.');
    form.elements.examName.value = '';
    form.elements.subject.value = '';
    form.elements.score.value = '';
    form.elements.maximumScore.value = '';
    await loadTeacherResults();
  } catch (error) { showToast(error.message, true); }
  finally { button.disabled = false; }
});

document.querySelectorAll('[data-logout]').forEach((button) => button.addEventListener('click', async () => {
  try {
    const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    if (!response.ok) throw new Error('Could not sign out. Please try again.');
    window.location.assign('login.html');
  } catch (error) { showToast(error.message, true); }
}));

api('/api/management/me').then(async ({ user }) => {
  if (user.role !== 'teacher') {
    window.location.replace(user.role === 'admin' ? 'admin.html' : 'student.html');
    return;
  }
  document.querySelectorAll('[data-name]').forEach((node) => { node.textContent = user.name; });
  document.querySelectorAll('[data-avatar]').forEach((node) => { node.textContent = initials(user.name); });
  const [classData, noticeData] = await Promise.all([api('/api/management/classes'), api('/api/management/notices')]);
  const classOptions = `<option value="">Select an assigned class</option>${classData.classes.map((item) => `<option value="${item.id}">${escapeHtml(item.name)} · ${escapeHtml(item.code)}</option>`).join('')}`;
  document.querySelector('[data-class]').innerHTML = classOptions;
  document.querySelector('[data-assignment-class]').innerHTML = classOptions;
  document.querySelector('[data-results-class]').innerHTML = classOptions;
  const notices = document.querySelector('[data-notices]');
  notices.innerHTML = noticeData.notices.length
    ? noticeData.notices.map((notice) => `<article class="notice-card"><div class="notice-top"><h3>${escapeHtml(notice.title)}</h3><span class="notice-audience">${escapeHtml(notice.audience)}</span></div><p>${escapeHtml(notice.body)}</p><small>${escapeHtml(new Date(`${notice.createdAt.replace(' ', 'T')}Z`).toLocaleString())}</small></article>`).join('')
    : '<p class="empty-state">There are no current notices.</p>';
  await Promise.all([loadAssignments(), loadTeacherResults()]);
}).catch(() => window.location.replace('login.html'));
