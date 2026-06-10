import { triggerToastNotification } from '../simulatorBar';
import { apiClient } from '../../data/apiClient';

export async function renderBoardTab(container: HTMLElement): Promise<void> {
  const members = await apiClient.get<any[]>('/board');

  container.innerHTML = `
    <div class="card-header-with-action">
      <h2 class="card-title">School Board of Management</h2>
      <button class="btn-accent" id="btn-add-board">Register Board Member</button>
    </div>
    <div class="table-wrapper">
      <table class="premium-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Executive Title</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${members.map(m => `
            <tr>
              <td><strong>${m.id}</strong></td>
              <td>${m.name}</td>
              <td><span class="badge" style="background:var(--navy); color:var(--gold-light);">${m.title}</span></td>
              <td>${m.email}</td>
              <td>${m.phone}</td>
              <td>
                <div class="action-btn-group">
                  <button class="btn-action" data-action="edit-brd" data-id="${m.id}">Edit</button>
                  <button class="btn-action danger" data-action="del-brd" data-id="${m.id}">Remove</button>
                </div>
              </td>
            </tr>
          `).join('')}
          ${members.length === 0 ? '<tr><td colspan="6" style="text-align:center;color:var(--text-light)">No board members registered</td></tr>' : ''}
        </tbody>
      </table>
    </div>
    <div id="brd-modal-container"></div>
  `;

  // Bind Add click
  container.querySelector('#btn-add-board')?.addEventListener('click', () => {
    showBoardModal(container, null);
  });

  // Bind Edit clicks
  container.querySelectorAll('[data-action="edit-brd"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const memberId = (btn as HTMLElement).dataset.id;
      const member = members.find(m => m.id === memberId);
      if (member) showBoardModal(container, member);
    });
  });

  // Bind Delete clicks
  container.querySelectorAll('[data-action="del-brd"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const memberId = (btn as HTMLElement).dataset.id!;
      const mc = container.querySelector('#brd-modal-container')!;
      mc.innerHTML = `
        <div class="confirm-overlay"><div class="confirm-dialog">
          <h3>Remove Board Member?</h3><p>This will permanently delete this record.</p>
          <div class="confirm-actions">
            <button class="btn-secondary" id="confirm-no">Cancel</button>
            <button class="btn-primary" id="confirm-yes" style="background:var(--crimson);">Confirm Remove</button>
          </div>
        </div></div>
      `;
      mc.querySelector('#confirm-no')?.addEventListener('click', () => { mc.innerHTML = ''; });
      mc.querySelector('#confirm-yes')?.addEventListener('click', async () => {
        mc.innerHTML = '';
        try {
          await apiClient.delete(`/board/${memberId}`);
          triggerToastNotification('Member Removed', 'Board member successfully removed.');
          renderBoardTab(container);
        } catch (err: any) {
          triggerToastNotification('Error', err.message, 'danger');
        }
      });
    });
  });
}

function showBoardModal(container: HTMLElement, member: any | null): void {
  const mc = container.querySelector('#brd-modal-container')!;
  const isEdit = !!member;

  mc.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-content">
        <div class="modal-header">
          <h3>${isEdit ? 'Edit Board Member' : 'Register Board Member'}</h3>
          <button class="modal-close-btn" id="close-brd-modal">×</button>
        </div>
        <form id="brd-form">
          <div class="modal-body">
            <div class="form-group">
              <label>Full Name</label>
              <input type="text" id="bf-name" class="form-control" value="${member?.name || ''}" placeholder="e.g. Dr. John Doe" required>
            </div>
            <div class="form-group">
              <label>Executive Title</label>
              <input type="text" id="bf-title" class="form-control" value="${member?.title || ''}" placeholder="e.g. Chairman" required>
            </div>
            <div class="form-group">
              <label>Email Address</label>
              <input type="email" id="bf-email" class="form-control" value="${member?.email || ''}" required>
            </div>
            <div class="form-group">
              <label>Mobile Phone</label>
              <input type="text" id="bf-phone" class="form-control" value="${member?.phone || ''}" placeholder="e.g. +254 700 000000" required>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn-secondary" id="cancel-brd-modal">Cancel</button>
            <button type="submit" class="btn-primary">${isEdit ? 'Save Changes' : 'Register Member'}</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const close = () => { mc.innerHTML = ''; };
  mc.querySelector('#close-brd-modal')?.addEventListener('click', close);
  mc.querySelector('#cancel-brd-modal')?.addEventListener('click', close);

  mc.querySelector('#brd-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const payload = {
      name: (mc.querySelector('#bf-name') as HTMLInputElement).value.trim(),
      title: (mc.querySelector('#bf-title') as HTMLInputElement).value.trim(),
      email: (mc.querySelector('#bf-email') as HTMLInputElement).value.trim(),
      phone: (mc.querySelector('#bf-phone') as HTMLInputElement).value.trim()
    };

    try {
      if (isEdit) {
        await apiClient.put(`/board/${member.id}`, payload);
      } else {
        await apiClient.post('/board', payload);
      }

      triggerToastNotification('Success', isEdit ? 'Member updated successfully.' : 'New member registered.');
      close();
      renderBoardTab(container);
    } catch (err: any) {
      triggerToastNotification('Save Failed', err.message, 'danger');
    }
  });
}
