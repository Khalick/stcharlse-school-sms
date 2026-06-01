import { triggerToastNotification } from '../simulatorBar';
import { apiClient } from '../../data/apiClient';
import { showConfirm } from './studentsTab';

export async function renderMaterialsTab(container: HTMLElement): Promise<void> {
  const materials = await apiClient.get<any[]>('/materials');
  
  container.innerHTML = `
    <div class="card-header-with-action">
      <h2 class="card-title">Study Materials Vault</h2>
    </div>
    <div class="table-wrapper">
      <table class="premium-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Title</th>
            <th>Subject</th>
            <th>Grade Level</th>
            <th>Published By (Author ID)</th>
            <th>Created At</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${materials.map(m => `
            <tr>
              <td><strong>${m.id}</strong></td>
              <td>${m.title}</td>
              <td>${m.subject}</td>
              <td><span class="badge badge-success">${m.grade}</span></td>
              <td>${m.authorName || m.authorId} (${m.authorId})</td>
              <td>${m.createdAt || 'N/A'}</td>
              <td>
                <div class="action-btn-group">
                  <button class="btn-action danger" data-action="del-mat" data-id="${m.id}">Delete</button>
                </div>
              </td>
            </tr>
          `).join('')}
          ${materials.length === 0 ? '<tr><td colspan="7" style="text-align:center;color:var(--text-light)">No materials have been published to the student vault yet</td></tr>' : ''}
        </tbody>
      </table>
    </div>
  `;

  // Bind Delete clicks
  container.querySelectorAll('[data-action="del-mat"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const materialId = (btn as HTMLElement).dataset.id!;
      showConfirm(container, `Delete study material ${materialId}?`, 'This will permanently remove the study handout from the student vault. Students of the assigned grade will no longer be able to read or query Charlie AI about it.', async () => {
        try {
          await apiClient.delete(`/materials/${materialId}`);
          triggerToastNotification('Handout Deleted', `Study material ${materialId} removed.`);
          renderMaterialsTab(container);
        } catch (err: any) {
          triggerToastNotification('Delete Failed', err.message, 'danger');
        }
      });
    });
  });
}
