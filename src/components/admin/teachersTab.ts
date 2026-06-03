import { triggerToastNotification } from '../simulatorBar';
import { apiClient } from '../../data/apiClient';
import { showPasswordModal, showConfirm } from './studentsTab';

export async function renderTeachersTab(container: HTMLElement): Promise<void> {
  const teachers = await apiClient.get<any[]>('/teachers');

  container.innerHTML = `
    <div class="card-header-with-action">
      <h2 class="card-title">Teacher Staff Directory</h2>
      <button class="btn-accent" id="btn-add-teacher">Add New Teacher</button>
    </div>
    <div class="table-wrapper">
      <table class="premium-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Subject</th>
            <th>Class Stream</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${teachers.map(t => `
            <tr>
              <td><strong>${t.id}</strong></td>
              <td>${t.name}</td>
              <td>${t.email}</td>
              <td>${t.phone || '<span style="color:var(--text-muted)">None</span>'}</td>
              <td>${t.subject}</td>
              <td>${t.stream}</td>
              <td>
                ${t.approved 
                  ? '<span class="badge badge-success">Approved</span>' 
                  : '<span class="badge badge-warning" style="background:#FEF3C7; color:#D97706;">Pending</span>'}
              </td>
              <td>
                <div class="action-btn-group">
                  ${!t.approved ? `<button class="btn-action" data-action="approve-tch" data-id="${t.id}" style="background:#10B981; color:#fff; border:none; padding:4px 8px; border-radius:4px; font-weight:600; cursor:pointer;">Approve</button>` : ''}
                  <button class="btn-action" data-action="edit-tch" data-id="${t.id}">Edit</button>
                  <button class="btn-action warning" data-action="pwd-tch" data-id="${t.id}">Reset Pwd</button>
                  <button class="btn-action danger" data-action="del-tch" data-id="${t.id}">Delete</button>
                </div>
              </td>
            </tr>
          `).join('')}
          ${teachers.length === 0 ? '<tr><td colspan="8" style="text-align:center;color:var(--text-light)">No teachers registered in directory</td></tr>' : ''}
        </tbody>
      </table>
    </div>
    <div id="tch-modal-container"></div>
  `;

  // Bind Approve clicks
  container.querySelectorAll('[data-action="approve-tch"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const teacherId = (btn as HTMLElement).dataset.id!;
      try {
        await apiClient.put(`/teachers/${teacherId}/approve`, {});
        triggerToastNotification('Teacher Approved', `Teacher ${teacherId} has been approved successfully.`);
        renderTeachersTab(container);
      } catch (err: any) {
        triggerToastNotification('Approval Failed', err.message, 'danger');
      }
    });
  });

  // Bind Add Teacher click
  container.querySelector('#btn-add-teacher')?.addEventListener('click', () => {
    showTeacherModal(container, null);
  });

  // Bind Edit clicks
  container.querySelectorAll('[data-action="edit-tch"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const teacherId = (btn as HTMLElement).dataset.id;
      const teacher = teachers.find(t => t.id === teacherId);
      if (teacher) {
        showTeacherModal(container, teacher);
      }
    });
  });

  // Bind Password Reset clicks
  container.querySelectorAll('[data-action="pwd-tch"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const teacherId = (btn as HTMLElement).dataset.id!;
      showPasswordModal(container, teacherId, 'teacher');
    });
  });

  // Bind Delete clicks
  container.querySelectorAll('[data-action="del-tch"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const teacherId = (btn as HTMLElement).dataset.id!;
      showConfirm(container, `Remove teacher ${teacherId}?`, 'Removing this teacher record will delete their details from the database.', async () => {
        try {
          await apiClient.delete(`/teachers/${teacherId}`);
          triggerToastNotification('Teacher Account Removed', `Teacher record ${teacherId} deleted successfully.`);
          renderTeachersTab(container);
        } catch (err: any) {
          triggerToastNotification('Delete Failed', err.message, 'danger');
        }
      });
    });
  });

}

function showTeacherModal(container: HTMLElement, teacher: any | null): void {
  const modalContainer = container.querySelector('#tch-modal-container')!;
  const isEdit = !!teacher;

  modalContainer.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-content">
        <div class="modal-header">
          <h3>${isEdit ? 'Edit Teacher Details' : 'Add New Teacher Profile'}</h3>
          <button class="modal-close-btn" id="close-tch-modal">×</button>
        </div>
        <form id="tch-form">
          <div class="modal-body">
            <div class="form-group">
              <label for="tf-name">Teacher Full Name</label>
              <input type="text" id="tf-name" class="form-control" value="${teacher?.name || ''}" placeholder="e.g. Margaret Neri" required>
            </div>
            <div class="form-group">
              <label for="tf-email">Email Address</label>
              <input type="email" id="tf-email" class="form-control" value="${teacher?.email || ''}" placeholder="e.g. margaret@stcharles.sc.ke" required>
            </div>
            <div class="form-group">
              <label for="tf-phone">Mobile Phone</label>
              <input type="text" id="tf-phone" class="form-control" value="${teacher?.phone || ''}" placeholder="e.g. +254 700 123456">
            </div>
            <div class="form-group">
              <label for="tf-subject">Subject Specialization</label>
              <input type="text" id="tf-subject" class="form-control" value="${teacher?.subject || ''}" placeholder="e.g. Kiswahili / Biology" required>
            </div>
            <div class="form-group">
              <label for="tf-stream">Assigned Class Stream</label>
              <select id="tf-stream" class="form-control" required style="font-family: inherit;">
                <option value="Grade 7A" ${teacher?.stream === 'Grade 7A' ? 'selected' : ''}>Grade 7A</option>
                <option value="Grade 8" ${teacher?.stream === 'Grade 8' ? 'selected' : ''}>Grade 8</option>
                <option value="Grade 9" ${teacher?.stream === 'Grade 9' ? 'selected' : ''}>Grade 9</option>
              </select>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn-secondary" id="cancel-tch-modal">Cancel</button>
            <button type="submit" class="btn-primary">${isEdit ? 'Save Changes' : 'Create Teacher'}</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const closeModal = () => {
    modalContainer.innerHTML = '';
  };

  modalContainer.querySelector('#close-tch-modal')?.addEventListener('click', closeModal);
  modalContainer.querySelector('#cancel-tch-modal')?.addEventListener('click', closeModal);

  modalContainer.querySelector('#tch-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = (modalContainer.querySelector('#tf-name') as HTMLInputElement).value.trim();
    const email = (modalContainer.querySelector('#tf-email') as HTMLInputElement).value.trim();
    const phone = (modalContainer.querySelector('#tf-phone') as HTMLInputElement).value.trim();
    const subject = (modalContainer.querySelector('#tf-subject') as HTMLInputElement).value.trim();
    const stream = (modalContainer.querySelector('#tf-stream') as HTMLSelectElement).value;

    const payload = { name, email, phone, subject, stream };

    try {
      if (isEdit) {
        await apiClient.put(`/teachers/${teacher.id}`, payload);
      } else {
        await apiClient.post('/teachers', payload);
      }

      triggerToastNotification(
        isEdit ? 'Teacher Profile Saved' : 'Teacher Created',
        `Successfully saved profile for ${name}.`
      );

      closeModal();
      renderTeachersTab(container);
    } catch (err: any) {
      triggerToastNotification('Save Failed', err.message, 'danger');
    }
  });

}
