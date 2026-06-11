import { triggerToastNotification } from '../simulatorBar';
import { apiClient } from '../../data/apiClient';
import { showPasswordModal, showConfirm } from './studentsTab';
import { SCHOOL_STREAMS as STREAMS } from '../../lib/constants';

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
            <th>Subjects Taught</th>
            <th>Class Teacher (Pastoral)</th>
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
              <td>
                ${t.subjects && t.subjects.length > 0 
                  ? t.subjects.map((s: any) => `<span class="badge" style="margin-bottom:2px;display:inline-block">${s.subject} (${s.stream})</span>`).join(' ')
                  : '<span style="color:var(--text-muted)">None</span>'
                }
              </td>
              <td>${t.class_teacher_stream ? `<span class="badge" style="background:#10B981; color:#fff;">${t.class_teacher_stream}</span>` : '<span style="color:var(--text-muted)">None</span>'}</td>
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

  let subjectsList: { stream: string, subject: string }[] = teacher?.subjects ? [...teacher.subjects] : [];

  const renderSubjectsList = () => {
    const listContainer = modalContainer.querySelector('#tf-subjects-container') as HTMLElement;
    if (!listContainer) return;
    
    if (subjectsList.length === 0) {
      listContainer.innerHTML = `<p style="font-size: 0.85rem; color: var(--text-muted); margin: 0;">No subjects assigned yet.</p>`;
      return;
    }

    listContainer.innerHTML = subjectsList.map((subj, index) => `
      <div style="display: flex; gap: 8px; margin-bottom: 8px; align-items: center; background: #f8fafc; padding: 6px; border-radius: 4px;">
        <select class="form-control subject-stream-select" data-index="${index}" style="font-family: inherit; flex: 1; padding: 4px;">
          <option value="">Select Stream...</option>
          ${STREAMS.map(g => `<option value="${g}" ${subj.stream === g ? 'selected' : ''}>${g}</option>`).join('')}
        </select>
        <input type="text" class="form-control subject-name-input" data-index="${index}" value="${subj.subject}" placeholder="Subject (e.g. Math)" style="flex: 1; padding: 4px;">
        <button type="button" class="btn-action danger btn-remove-subject" data-index="${index}" style="padding: 4px 8px;">×</button>
      </div>
    `).join('');

    // Bind subject inputs
    listContainer.querySelectorAll('.subject-stream-select').forEach(el => {
      el.addEventListener('change', (e: any) => {
        const idx = parseInt(e.target.dataset.index);
        subjectsList[idx].stream = e.target.value;
      });
    });
    listContainer.querySelectorAll('.subject-name-input').forEach(el => {
      el.addEventListener('input', (e: any) => {
        const idx = parseInt(e.target.dataset.index);
        subjectsList[idx].subject = e.target.value;
      });
    });
    listContainer.querySelectorAll('.btn-remove-subject').forEach(el => {
      el.addEventListener('click', (e: any) => {
        const idx = parseInt((e.currentTarget as HTMLElement).dataset.index!);
        subjectsList.splice(idx, 1);
        renderSubjectsList();
      });
    });
  };

  modalContainer.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-content" style="max-width: 500px;">
        <div class="modal-header">
          <h3>${isEdit ? 'Edit Teacher Details' : 'Add New Teacher Profile'}</h3>
          <button class="modal-close-btn" id="close-tch-modal">×</button>
        </div>
        <form id="tch-form">
          <div class="modal-body">
            <div class="form-group">
              <label for="tf-name">Teacher Full Name <span style="color:red">*</span></label>
              <input type="text" id="tf-name" class="form-control" value="${teacher?.name || ''}" placeholder="e.g. Teacher Mike" required>
            </div>
            <div class="form-group">
              <label for="tf-email">Email Address <span style="color:red">*</span></label>
              <input type="email" id="tf-email" class="form-control" value="${teacher?.email || ''}" placeholder="e.g. mike@stcharles.sc.ke" required>
            </div>
            <div class="form-group">
              <label for="tf-phone">Mobile Phone (For Alerts) <span style="color:red">*</span></label>
              <input type="text" id="tf-phone" class="form-control" value="${teacher?.phone || ''}" placeholder="e.g. 254700000000" required>
            </div>
            
            <div class="form-group" style="margin-top: 1rem; border-top: 1px solid var(--border-color); padding-top: 1rem;">
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-weight: 600;">
                <input type="checkbox" id="tf-is-class-teacher" ${teacher?.class_teacher_stream ? 'checked' : ''} style="width: 16px; height: 16px;">
                Assign as Class Teacher (Pastoral Care)
              </label>
              <div id="tf-class-teacher-group" style="display: ${teacher?.class_teacher_stream ? 'block' : 'none'}; margin-top: 0.5rem; padding-left: 24px;">
                <label for="tf-stream">Class Stream</label>
                <select id="tf-stream" class="form-control" style="font-family: inherit;">
                  <option value="">Select Stream...</option>
                  ${STREAMS.map(g => `<option value="${g}" ${teacher?.class_teacher_stream === g ? 'selected' : ''}>${g}</option>`).join('')}
                </select>
              </div>
            </div>

            <div class="form-group" style="margin-top: 1rem; border-top: 1px solid var(--border-color); padding-top: 1rem;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <label style="margin: 0; font-weight: 600;">Academic Subjects Taught</label>
                <button type="button" class="btn-action" id="btn-add-subject" style="padding: 2px 8px; font-size: 0.85rem;">+ Add Subject</button>
              </div>
              <div id="tf-subjects-container">
                <!-- Dynamically populated subjects -->
              </div>
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

  renderSubjectsList();

  const isClassTeacherCheck = modalContainer.querySelector('#tf-is-class-teacher') as HTMLInputElement;
  const classTeacherGroup = modalContainer.querySelector('#tf-class-teacher-group') as HTMLElement;

  isClassTeacherCheck.addEventListener('change', () => {
    classTeacherGroup.style.display = isClassTeacherCheck.checked ? 'block' : 'none';
  });

  modalContainer.querySelector('#btn-add-subject')?.addEventListener('click', () => {
    subjectsList.push({ stream: '', subject: '' });
    renderSubjectsList();
  });

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
    
    const isClassTeacher = isClassTeacherCheck.checked;
    const classTeacherStream = (modalContainer.querySelector('#tf-stream') as HTMLSelectElement).value;

    if (isClassTeacher && !classTeacherStream) {
      triggerToastNotification('Validation Error', 'Please select a stream for the Class Teacher.', 'danger');
      return;
    }

    // Filter out empty subjects
    const validSubjects = subjectsList.filter(s => s.stream.trim() !== '' && s.subject.trim() !== '');

    const payload = { 
      name, 
      email, 
      phone, 
      isClassTeacher, 
      classTeacherStream: isClassTeacher ? classTeacherStream : null, 
      subjects: validSubjects 
    };

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
