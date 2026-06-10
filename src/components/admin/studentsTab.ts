import { triggerToastNotification } from '../simulatorBar';
import { apiClient } from '../../data/apiClient';
import { getDb } from '../../data/mockDb';


let searchQuery = '';
let currentAdminStreamFilter = 'All Streams';

export async function renderStudentsTab(container: HTMLElement, streamFilter?: string, forceReadOnly?: boolean): Promise<void> {
  const db = getDb();
  const isTeacher = db.currentUser?.role === 'teacher';
  
  let students: any[] = [];
  try {
    if (isTeacher) {
      students = await apiClient.get<any[]>(`/teachers/${db.currentUser?.id || ''}/students${streamFilter ? '?stream=' + encodeURIComponent(streamFilter) : ''}`);
      if (searchQuery) {
        const query = searchQuery.trim().toLowerCase();
        students = students.filter(s => 
          s.id.toLowerCase().includes(query) ||
          s.name.toLowerCase().includes(query) ||
          s.stream.toLowerCase().includes(query)
        );
      }
    } else {
      students = await apiClient.get<any[]>(`/students?q=${encodeURIComponent(searchQuery)}`);
    }
  } catch (err: any) {
    triggerToastNotification('Error', 'Failed to retrieve students: ' + err.message, 'danger');
  }

  const isReadOnlyWorkspace = forceReadOnly || (students.length > 0 && students[0].isReadOnly);

  // Group students by stream
  const allStreams = Array.from(new Set(students.map(s => s.stream))).sort();
  
  if (!isTeacher && currentAdminStreamFilter !== 'All Streams') {
    students = students.filter(s => s.stream === currentAdminStreamFilter);
  }

  const streams = Array.from(new Set(students.map(s => s.stream))).sort();
  let tablesHtml = '';

  if (students.length === 0) {
    tablesHtml = '<div class="table-wrapper"><p style="text-align:center;color:var(--text-light);padding:20px;">No records found</p></div>';
  } else {
    for (const stream of streams) {
      const streamStudents = students.filter(s => s.stream === stream);
      tablesHtml += `
        <h3 style="margin-top:24px; margin-bottom:8px; color:var(--primary-dark); border-bottom:2px solid var(--border); padding-bottom:4px;">${stream}</h3>
        <div class="table-wrapper"><table class="premium-table"><thead><tr>
          <th>ID</th><th>Name</th><th>Guardian</th><th>Attendance</th><th>Actions</th>
        </tr></thead><tbody>
          ${streamStudents.map(s => `<tr>
            <td><strong>${s.id}</strong></td><td>${s.name}</td>
            <td>${s.guardianName} ${s.guardianPhone ? `(${s.guardianPhone})` : ''}</td>
            <td><span class="badge ${s.attendanceRate >= 95 ? 'badge-success' : 'badge-warning'}">${s.attendanceRate}%</span></td>
            <td><div class="action-btn-group">
              ${isReadOnlyWorkspace ? `<span style="font-size:0.85rem; color:var(--text-light); font-style:italic;">Read-Only (Class Teacher Only)</span>` : `
                <button class="btn-action" data-action="edit-stu" data-id="${s.id}">Edit</button>
                <button class="btn-action warning" data-action="pwd-stu" data-id="${s.id}">Reset Pwd</button>
                <button class="btn-action danger" data-action="del-stu" data-id="${s.id}">Delete</button>
              `}
            </div></td>
          </tr>`).join('')}
        </tbody></table></div>
      `;
    }
  }

  container.innerHTML = `
    <div class="card-header-with-action"><h2 class="card-title">${isTeacher ? 'Class Students Roster' : 'Student Directory'}</h2>
      ${isReadOnlyWorkspace ? '' : '<button class="btn-accent" id="btn-open-admission">Register New Student</button>'}</div>
    <div class="search-bar-container" style="display:flex; gap:12px;">
      ${!isTeacher ? `
        <select id="admin-stream-filter" class="form-control" style="width:200px; font-family:inherit;">
          <option value="All Streams" ${currentAdminStreamFilter === 'All Streams' ? 'selected' : ''}>All Grades</option>
          ${allStreams.map(g => `<option value="${g}" ${currentAdminStreamFilter === g ? 'selected' : ''}>${g}</option>`).join('')}
        </select>
      ` : ''}
      <input type="text" id="stu-search" class="form-control" placeholder="Search by name, stream, or ID..." value="${searchQuery}" style="flex:1;">
      <button class="btn-primary" id="btn-stu-search">Search</button>
    </div>
    <div id="students-tables-container">
      ${tablesHtml}
    </div>
    <div id="stu-modal-container"></div>
  `;


  // Search
  const doSearch = () => { searchQuery = (container.querySelector('#stu-search') as HTMLInputElement)?.value || ''; renderStudentsTab(container, streamFilter, forceReadOnly); };
  container.querySelector('#btn-stu-search')?.addEventListener('click', doSearch);
  container.querySelector('#stu-search')?.addEventListener('keyup', (e) => { if ((e as KeyboardEvent).key === 'Enter') doSearch(); });

  // Admin Stream Filter
  if (!isTeacher) {
    container.querySelector('#admin-stream-filter')?.addEventListener('change', (e) => {
      currentAdminStreamFilter = (e.target as HTMLSelectElement).value;
      renderStudentsTab(container, streamFilter, forceReadOnly);
    });
  }

  // Admit
  container.querySelector('#btn-open-admission')?.addEventListener('click', () => showStudentModal(container, null, streamFilter));

  // Actions
  container.querySelectorAll('[data-action="edit-stu"]').forEach(btn => btn.addEventListener('click', () => {
    const s = students.find(x => x.id === (btn as HTMLElement).dataset.id);
    if (s) showStudentModal(container, s, streamFilter);
  }));
  container.querySelectorAll('[data-action="pwd-stu"]').forEach(btn => btn.addEventListener('click', () => showPasswordModal(container, (btn as HTMLElement).dataset.id!, 'student')));
  container.querySelectorAll('[data-action="del-stu"]').forEach(btn => btn.addEventListener('click', () => {
    const id = (btn as HTMLElement).dataset.id!;
    showConfirm(container, `Remove student ${id}?`, 'This will permanently delete the student and their attendance records.', async () => {
      try { 
        await apiClient.delete(`/students/${id}`); 
        triggerToastNotification('Student Removed', `${id} deleted.`); 
        renderStudentsTab(container, streamFilter, forceReadOnly); 
      } catch (e: any) { 
        triggerToastNotification('Error', e.message, 'danger'); 
      }
    });
  }));
}

function showStudentModal(container: HTMLElement, student: any | null, streamFilter?: string): void {
  const mc = container.querySelector('#stu-modal-container')!;
  const isEdit = !!student;
  const db = getDb();
  const isTeacher = db.currentUser?.role === 'teacher';
  const defaultStream = streamFilter || db.currentUser?.stream || 'Grade 7A';

  mc.innerHTML = `<div class="modal-overlay"><div class="modal-content">
    <div class="modal-header"><h3>${isEdit ? 'Edit Student' : 'Register New Student'}</h3><button class="modal-close-btn" id="close-stu-modal">×</button></div>
    <form id="stu-form"><div class="modal-body">
      <div class="form-group"><label>Admission Number (ID)</label><input type="text" id="sf-id" class="form-control" value="${student?.id || ''}" placeholder="e.g. S001" required ${isEdit ? 'disabled' : ''}></div>
      <div class="form-group"><label>Student Name</label><input type="text" id="sf-name" class="form-control" value="${student?.name || ''}" required></div>
      <div class="form-group"><label>Class Stream</label><select id="sf-stream" class="form-control" required ${isTeacher ? 'disabled' : ''}>
        ${['Pre-Primary 1', 'Pre-Primary 2', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7A', 'Grade 8', 'Grade 9'].map(g => `<option value="${g}" ${student?.stream === g ? 'selected' : (defaultStream === g ? 'selected' : '')}>${g}</option>`).join('')}
      </select></div>
      <div class="form-group"><label>Guardian Name</label><input type="text" id="sf-gname" class="form-control" value="${student?.guardianName || ''}" required></div>
      <div class="form-group"><label>Guardian Phone</label><input type="tel" id="sf-gphone" class="form-control" value="${student?.guardianPhone || '+254 '}" required></div>
      <div class="form-group"><label>Guardian Email</label><input type="email" id="sf-gemail" class="form-control" value="${student?.guardianEmail || ''}" required></div>
    </div><div class="modal-footer">
      <button type="button" class="btn-secondary" id="cancel-stu-modal">Cancel</button>
      <button type="submit" class="btn-primary">${isEdit ? 'Save Changes' : 'Admit Student'}</button>
    </div></form></div></div>`;

  const close = () => { mc.innerHTML = ''; };
  mc.querySelector('#close-stu-modal')?.addEventListener('click', close);
  mc.querySelector('#cancel-stu-modal')?.addEventListener('click', close);
  mc.querySelector('#stu-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      id: (mc.querySelector('#sf-id') as HTMLInputElement).value.trim(),
      name: (mc.querySelector('#sf-name') as HTMLInputElement).value.trim(),
      stream: isTeacher ? defaultStream : (mc.querySelector('#sf-stream') as HTMLSelectElement).value,
      guardianName: (mc.querySelector('#sf-gname') as HTMLInputElement).value.trim(),
      guardianPhone: (mc.querySelector('#sf-gphone') as HTMLInputElement).value.trim(),
      guardianEmail: (mc.querySelector('#sf-gemail') as HTMLInputElement).value.trim(),
    };
    try {
      if (isEdit) {
        await apiClient.put(`/students/${student.id}`, body);
      } else {
        await apiClient.post('/students', body);
      }

      triggerToastNotification(isEdit ? 'Student Updated' : 'Student Admitted', `${body.name} saved.`);
      close(); renderStudentsTab(container, streamFilter, isTeacher && defaultStream !== db.currentUser?.stream);
    } catch (err: any) { triggerToastNotification('Error', err.message, 'danger'); }
  });
}

function showPasswordModal(container: HTMLElement, id: string, type: 'student' | 'teacher'): void {
  const mc = container.querySelector('#stu-modal-container') || container.querySelector('#tch-modal-container');
  if (!mc) return;
  mc.innerHTML = `<div class="modal-overlay"><div class="modal-content">
    <div class="modal-header"><h3>Reset Password — ${id}</h3><button class="modal-close-btn" id="close-pwd-modal">×</button></div>
    <form id="pwd-form"><div class="modal-body">
      <div class="form-group"><label>New Password (min 6 chars)</label><input type="text" id="pf-pwd" class="form-control" minlength="6" required></div>
    </div><div class="modal-footer">
      <button type="button" class="btn-secondary" id="cancel-pwd-modal">Cancel</button>
      <button type="submit" class="btn-primary">Reset Password</button>
    </div></form></div></div>`;

  const close = () => { mc.innerHTML = ''; };
  mc.querySelector('#close-pwd-modal')?.addEventListener('click', close);
  mc.querySelector('#cancel-pwd-modal')?.addEventListener('click', close);
  mc.querySelector('#pwd-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pwd = (mc.querySelector('#pf-pwd') as HTMLInputElement).value;
    const endpoint = type === 'student' ? `/students/${id}/password` : `/teachers/${id}/password`;
    try {
      await apiClient.put(endpoint, { newPassword: pwd });
      triggerToastNotification('Password Reset', `Password for ${id} updated.`);
      close();
    } catch (err: any) { triggerToastNotification('Error', err.message, 'danger'); }
  });

}

function showConfirm(container: HTMLElement, title: string, msg: string, onConfirm: () => void): void {
  const div = document.createElement('div');
  div.innerHTML = `<div class="confirm-overlay"><div class="confirm-dialog">
    <h3>${title}</h3><p>${msg}</p>
    <div class="confirm-actions"><button class="btn-secondary" id="confirm-no">Cancel</button><button class="btn-primary" id="confirm-yes" style="background:var(--crimson);">Confirm Delete</button></div>
  </div></div>`;
  container.appendChild(div);
  div.querySelector('#confirm-no')?.addEventListener('click', () => div.remove());
  div.querySelector('#confirm-yes')?.addEventListener('click', () => { div.remove(); onConfirm(); });
}

export { showPasswordModal, showConfirm };
