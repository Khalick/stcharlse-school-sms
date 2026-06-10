import { triggerToastNotification } from '../simulatorBar';
import { apiClient } from '../../data/apiClient';
import { showConfirm } from './studentsTab';

let currentTimetableFilter = 'All Streams';

export async function renderTimetableTab(container: HTMLElement): Promise<void> {
  const allEvents = await apiClient.get<any[]>('/admin/timetable');
  const teachers = await apiClient.get<any[]>('/teachers');

  let timetable = allEvents;
  if (currentTimetableFilter !== 'All Streams') {
    timetable = allEvents.filter((e: any) => e.stream === currentTimetableFilter);
  }

  const fmt = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

  const allStreams = Array.from(new Set(allEvents.map((e: any) => e.stream))).sort();
  const streams = Array.from(new Set(timetable.map((e: any) => e.stream))).sort();
  let tablesHtml = '';
  
  if (timetable.length === 0) {
    tablesHtml = '<div class="table-wrapper"><p style="text-align:center;color:var(--text-light);padding:20px;">No schedule events configured</p></div>';
  } else {
    for (const stream of streams) {
      // Sort by start_time so subjects appear chronologically
      const streamEvents = timetable.filter(e => e.stream === stream).sort((a, b) => a.start_time - b.start_time);
      tablesHtml += `
        <h3 style="margin-top:24px; margin-bottom:8px; color:var(--primary-dark); border-bottom:2px solid var(--border); padding-bottom:4px;">${stream} Schedule</h3>
        <div class="table-wrapper"><table class="premium-table"><thead><tr>
          <th>ID</th><th>Time slot</th><th>Subject</th><th>Room</th><th>Assigned Teacher</th><th>Actions</th>
        </tr></thead><tbody>
          ${streamEvents.map(ev => `<tr>
            <td><strong>${ev.id}</strong></td>
            <td>${fmt(ev.start_time)} - ${fmt(ev.end_time)}</td>
            <td>${ev.subject}</td>
            <td>${ev.room}</td>
            <td>${ev.teacher_name} (${ev.teacher_id})</td>
            <td><div class="action-btn-group">
              <button class="btn-action" data-action="edit-ev" data-id="${ev.id}">Edit</button>
              <button class="btn-action danger" data-action="del-ev" data-id="${ev.id}">Delete</button>
            </div></td>
          </tr>`).join('')}
        </tbody></table></div>
      `;
    }
  }

  container.innerHTML = `
    <div class="card-header-with-action">
      <h2 class="card-title">Class Schedule Timetable</h2>
      <div class="action-btn-group" style="display: flex; gap: 8px;">
        <select id="tt-stream-filter" class="form-control" style="width:200px; font-family:inherit;">
          <option value="All Streams" ${currentTimetableFilter === 'All Streams' ? 'selected' : ''}>All Grades</option>
          ${allStreams.map((g: unknown) => `<option value="${g as string}" ${currentTimetableFilter === g ? 'selected' : ''}>${g as string}</option>`).join('')}
        </select>
        <button class="btn-accent" id="btn-bulk-import-ai" style="background: var(--navy); color: var(--gold-light); border: 1px solid var(--gold-light);">Bulk Import Timetable (AI)</button>
        <button class="btn-accent" id="btn-add-event">Add Schedule Event</button>
      </div>
    </div>
    <div id="timetable-tables-container">
      ${tablesHtml}
    </div>
    <div id="ev-modal-container"></div>
  `;

  // Bind Filter Change
  container.querySelector('#tt-stream-filter')?.addEventListener('change', (e) => {
    currentTimetableFilter = (e.target as HTMLSelectElement).value;
    renderTimetableTab(container);
  });

  // Bind Bulk Import click
  container.querySelector('#btn-bulk-import-ai')?.addEventListener('click', () => {
    showBulkImportModal(container, teachers);
  });

  // Bind Add Event click
  container.querySelector('#btn-add-event')?.addEventListener('click', () => {
    showEventModal(container, null, teachers);
  });

  // Bind Edit clicks
  container.querySelectorAll('[data-action="edit-ev"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const eventId = (btn as HTMLElement).dataset.id;
      const event = timetable.find(e => e.id === eventId);
      if (event) {
        showEventModal(container, event, teachers);
      }
    });
  });

  // Bind Delete clicks
  container.querySelectorAll('[data-action="del-ev"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const eventId = (btn as HTMLElement).dataset.id!;
      showConfirm(container, `Delete timetable event ${eventId}?`, 'This will permanently remove the class period from the timetabling database.', async () => {
        try {
          await apiClient.delete(`/admin/timetable/${eventId}`);
          triggerToastNotification('Event Removed', `Timetable event ${eventId} deleted.`);
          renderTimetableTab(container);
        } catch (err: any) {
          triggerToastNotification('Delete Failed', err.message, 'danger');
        }
      });
    });
  });
}

function showEventModal(container: HTMLElement, event: any | null, teachers: any[]): void {
  const modalContainer = container.querySelector('#ev-modal-container')!;
  const isEdit = !!event;

  const fmtTime = (m: number) => {
    const hrs = Math.floor(m / 60) % 24;
    const mins = m % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  };

  modalContainer.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-content">
        <div class="modal-header">
          <h3>${isEdit ? 'Edit Schedule Event' : 'Add Timetable Event'}</h3>
          <button class="modal-close-btn" id="close-ev-modal">×</button>
        </div>
        <form id="ev-form">
          <div class="modal-body">
            <div class="form-group">
              <label for="ef-teacher">Assigned Teacher</label>
              <select id="ef-teacher" class="form-control" required style="font-family: inherit;">
                ${teachers.map(t => `<option value="${t.id}" ${event?.teacher_id === t.id ? 'selected' : ''}>${t.name} (${t.subject})</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label for="ef-subject">Subject</label>
              <input type="text" id="ef-subject" class="form-control" value="${event?.subject || ''}" placeholder="e.g. Mathematics" required>
            </div>
            <div class="form-group">
              <label for="ef-stream">Class Stream</label>
              <select id="ef-stream" class="form-control" required style="font-family: inherit;">
                ${['Pre-Primary 1', 'Pre-Primary 2', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7A', 'Grade 8', 'Grade 9'].map(g => `<option value="${g}" ${event?.stream === g ? 'selected' : ''}>${g}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label for="ef-room">Classroom Room</label>
              <input type="text" id="ef-room" class="form-control" value="${event?.room || ''}" placeholder="e.g. Room 4B" required>
            </div>
            <div style="display:flex; gap:12px;">
              <div class="form-group" style="flex:1;">
                <label for="ef-start">Start Time</label>
                <input type="time" id="ef-start" class="form-control" value="${event ? fmtTime(event.start_time) : '08:00'}" required>
              </div>
              <div class="form-group" style="flex:1;">
                <label for="ef-end">End Time</label>
                <input type="time" id="ef-end" class="form-control" value="${event ? fmtTime(event.end_time) : '09:00'}" required>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn-secondary" id="cancel-ev-modal">Cancel</button>
            <button type="submit" class="btn-primary">${isEdit ? 'Save Changes' : 'Create Event'}</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const closeModal = () => {
    modalContainer.innerHTML = '';
  };

  modalContainer.querySelector('#close-ev-modal')?.addEventListener('click', closeModal);
  modalContainer.querySelector('#cancel-ev-modal')?.addEventListener('click', closeModal);

  modalContainer.querySelector('#ev-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const teacherId = (modalContainer.querySelector('#ef-teacher') as HTMLSelectElement).value;
    const subject = (modalContainer.querySelector('#ef-subject') as HTMLInputElement).value.trim();
    const stream = (modalContainer.querySelector('#ef-stream') as HTMLSelectElement).value;
    const room = (modalContainer.querySelector('#ef-room') as HTMLInputElement).value.trim();

    const startVal = (modalContainer.querySelector('#ef-start') as HTMLInputElement).value;
    const endVal = (modalContainer.querySelector('#ef-end') as HTMLInputElement).value;

    const [startHrs, startMins] = startVal.split(':').map(Number);
    const [endHrs, endMins] = endVal.split(':').map(Number);

    const startTime = startHrs * 60 + startMins;
    const endTime = endHrs * 60 + endMins;

    if (startTime >= endTime) {
      triggerToastNotification('Validation Error', 'Start time must be before end time.', 'danger');
      return;
    }

    const payload = { teacherId, subject, stream, room, startTime, endTime };

    try {
      if (isEdit) {
        await apiClient.put(`/admin/timetable/${event.id}`, payload);
      } else {
        await apiClient.post('/admin/timetable', payload);
      }

      triggerToastNotification(
        isEdit ? 'Event Updated' : 'Event Created',
        `Successfully saved schedule for ${subject}.`
      );

      closeModal();
      renderTimetableTab(container);
    } catch (err: any) {
      triggerToastNotification('Save Failed', err.message, 'danger');
    }
  });
}

function showBulkImportModal(container: HTMLElement, teachers: any[]): void {
  const modalContainer = container.querySelector('#ev-modal-container')!;
  
  modalContainer.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-content ai-scan-modal">
        <div class="modal-header">
          <h3>Bulk Import Timetable (Llama 3 AI)</h3>
          <button class="modal-close-btn" id="close-bulk-modal">×</button>
        </div>
        <div class="modal-body" id="bulk-modal-body">
          <div class="ai-scan-uploader">
            <p style="font-size:0.85rem; color:var(--text-light); margin-bottom:8px;">
              Paste timetable schedule details or upload a timetable image/text file. Llama 3 will automatically extract subjects, class streams, classrooms, times, and match the assigned teachers.
            </p>
            
            <div class="form-group">
              <label for="bulk-text">Paste Timetable Text</label>
              <textarea id="bulk-text" class="form-control" rows="6" style="font-family:inherit; font-size:0.85rem;" placeholder="Monday: Grade 8 08:15-09:00 Pre-Tech with Teacher Beatrice in Room 5
Tuesday: Grade 9 10:00-10:45 Science with Agnes in Room 4"></textarea>
            </div>

            <div style="text-align: center; margin: 8px 0; font-weight: bold; color: var(--text-light);">- OR -</div>

            <div class="ai-scan-zone" id="bulk-dropzone">
              <input type="file" id="bulk-file" accept=".txt,.csv,.jpg,.jpeg,.png" style="display:none;">
              <div style="font-size: 2rem; color: var(--primary-accent); margin-bottom: 8px;">📂</div>
              <strong id="dropzone-text">Click to choose a Timetable file (PNG, JPG, CSV, TXT)</strong>
              <p>Maximum size: 4MB</p>
            </div>

            <div style="display:flex; justify-content: flex-end; gap:12px; margin-top: 16px;">
              <button class="btn-secondary" id="cancel-bulk-modal">Cancel</button>
              <button class="btn-primary" id="btn-submit-parse" style="background: var(--navy); border-color: var(--navy);">Parse with Llama 3</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const closeModal = () => {
    modalContainer.innerHTML = '';
  };

  modalContainer.querySelector('#close-bulk-modal')?.addEventListener('click', closeModal);
  modalContainer.querySelector('#cancel-bulk-modal')?.addEventListener('click', closeModal);

  // File selection triggering
  const dropzone = modalContainer.querySelector('#bulk-dropzone') as HTMLElement;
  const fileInput = modalContainer.querySelector('#bulk-file') as HTMLInputElement;
  const dropzoneText = modalContainer.querySelector('#dropzone-text') as HTMLElement;

  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) {
      dropzoneText.textContent = `Selected: ${fileInput.files[0].name}`;
    }
  });

  // Submit and Parse action
  const submitBtn = modalContainer.querySelector('#btn-submit-parse') as HTMLButtonElement;
  submitBtn.addEventListener('click', async () => {
    const textVal = (modalContainer.querySelector('#bulk-text') as HTMLTextAreaElement).value.trim();
    const file = fileInput.files?.[0];

    if (!textVal && !file) {
      triggerToastNotification('Input Error', 'Please paste timetable text or choose a file to upload.', 'danger');
      return;
    }

    // Show loading spinner
    const body = modalContainer.querySelector('#bulk-modal-body')!;
    body.innerHTML = `
      <div class="ai-scanning-loader">
        <div class="spinner"></div>
        <p>Charlie AI is analyzing your timetable layout with Llama 3...</p>
        <span style="font-size:0.75rem; color:var(--text-light); margin-top: 8px;">Resolving teacher identities against student database...</span>
      </div>
    `;

    try {
      let payload: any = {};

      if (file) {
        const base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            // Split base64 prefix
            const base64 = result.split(',')[1];
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        if (file.name.endsWith('.jpg') || file.name.endsWith('.jpeg') || file.name.endsWith('.png')) {
          payload.imageBase64 = base64Data;
          payload.mimeType = file.type;
        } else {
          // Plain text / CSV file - read as text
          const textContent = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsText(file);
          });
          payload.text = textContent;
        }
      } else {
        payload.text = textVal;
      }

      // API request to parse
      const resJson = await apiClient.post<{ events: any[] }>('/ai/parse-timetable', payload);
      const events: any[] = resJson.events || [];

      if (events.length === 0) {
        throw new Error('No timetable events could be extracted. Please check the document format or pasted text.');
      }

      // Render Review screen
      renderReviewScreen(body, events, teachers, container, closeModal);
    } catch (err: any) {
      triggerToastNotification('AI Parse Failed', err.message, 'danger');
      showBulkImportModal(container, teachers); // reset back to upload screen
    }
  });
}

function renderReviewScreen(
  bodyContainer: Element, 
  events: any[], 
  teachers: any[], 
  parentContainer: HTMLElement, 
  closeModal: () => void
): void {
  bodyContainer.innerHTML = `
    <h4 style="margin: 0 0 10px 0; color: var(--navy);">Verify & Review Extracted Slots</h4>
    <p style="font-size: 0.8rem; color: var(--text-light); margin-bottom: 12px;">
      Verify the fields parsed by Llama 3 below. Correct any teacher matches or times before importing. Discard any unwanted entries.
    </p>

    <div class="review-table-wrapper">
      <table class="review-table">
        <thead>
          <tr>
            <th style="width: 100px;">Day</th>
            <th style="width: 90px;">Start</th>
            <th style="width: 90px;">End</th>
            <th>Subject</th>
            <th style="width: 110px;">Stream</th>
            <th>Room</th>
            <th>Assigned Teacher</th>
            <th style="width: 60px;">Action</th>
          </tr>
        </thead>
        <tbody id="review-table-rows">
          ${events.map((ev, index) => `
            <tr data-index="${index}">
              <td>
                <input type="text" class="rev-day" value="${ev.day || 'Monday'}" placeholder="Day">
              </td>
              <td>
                <input type="time" class="rev-start" value="${ev.startTime || '08:00'}">
              </td>
              <td>
                <input type="time" class="rev-end" value="${ev.endTime || '09:00'}">
              </td>
              <td>
                <input type="text" class="rev-subject" value="${ev.subject || ''}" placeholder="Subject">
              </td>
              <td>
                <select class="rev-stream">
                  ${['Pre-Primary 1', 'Pre-Primary 2', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7A', 'Grade 8', 'Grade 9'].map(g => `<option value="${g}" ${ev.stream === g ? 'selected' : ''}>${g}</option>`).join('')}
                </select>
              </td>
              <td>
                <input type="text" class="rev-room" value="${ev.room || ''}" placeholder="Room">
              </td>
              <td>
                <select class="rev-teacher">
                  <option value="">-- Choose Teacher --</option>
                  ${teachers.map(t => `<option value="${t.id}" ${ev.resolvedTeacherId === t.id ? 'selected' : ''}>${t.name} (${t.subject})</option>`).join('')}
                </select>
              </td>
              <td>
                <button class="btn-action danger rev-delete-btn" style="padding: 4px 8px;">×</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div style="display:flex; justify-content: flex-end; gap:12px; margin-top: 16px;">
      <button class="btn-secondary" id="btn-back-upload">Back to Upload</button>
      <button class="btn-primary" id="btn-apply-bulk" style="background: var(--navy); border-color: var(--navy);">Apply Timetable to Database</button>
    </div>
  `;

  // Bind Discard Row clicks
  bodyContainer.querySelectorAll('.rev-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest('tr')!;
      row.remove();
      if (bodyContainer.querySelectorAll('#review-table-rows tr').length === 0) {
        bodyContainer.innerHTML = `<p style="text-align:center; padding: 20px; color:var(--text-light)">All events discarded.</p>
        <div style="display:flex; justify-content: flex-end; margin-top:16px;">
          <button class="btn-secondary" id="btn-back-upload-empty">Back to Upload</button>
        </div>`;
        bodyContainer.querySelector('#btn-back-upload-empty')?.addEventListener('click', () => {
          showBulkImportModal(parentContainer, teachers);
        });
      }
    });
  });

  // Bind Back button
  bodyContainer.querySelector('#btn-back-upload')?.addEventListener('click', () => {
    showBulkImportModal(parentContainer, teachers);
  });

  // Bind Apply bulk save
  bodyContainer.querySelector('#btn-apply-bulk')?.addEventListener('click', async () => {
    const rows = bodyContainer.querySelectorAll('#review-table-rows tr');
    const itemsToSave: any[] = [];
    let validationFailed = false;

    rows.forEach(row => {
      const startVal = (row.querySelector('.rev-start') as HTMLInputElement).value;
      const endVal = (row.querySelector('.rev-end') as HTMLInputElement).value;
      const subject = (row.querySelector('.rev-subject') as HTMLInputElement).value.trim();
      const stream = (row.querySelector('.rev-stream') as HTMLSelectElement).value;
      const room = (row.querySelector('.rev-room') as HTMLInputElement).value.trim();
      const teacherId = (row.querySelector('.rev-teacher') as HTMLSelectElement).value;

      if (!subject || !room || !teacherId) {
        triggerToastNotification('Validation Error', 'All fields (subject, room, assigned teacher) are required for each row.', 'danger');
        validationFailed = true;
        return;
      }

      const [startHrs, startMins] = startVal.split(':').map(Number);
      const [endHrs, endMins] = endVal.split(':').map(Number);

      const startTime = startHrs * 60 + startMins;
      const endTime = endHrs * 60 + endMins;

      if (startTime >= endTime) {
        triggerToastNotification('Time Error', `Start time must be before end time for ${subject}.`, 'danger');
        validationFailed = true;
        return;
      }

      itemsToSave.push({ teacherId, subject, stream, room, startTime, endTime });
    });

    if (validationFailed) return;
    if (itemsToSave.length === 0) return;

    // Save each slot sequentially
    try {
      const applyBtn = bodyContainer.querySelector('#btn-apply-bulk') as HTMLButtonElement;
      applyBtn.disabled = true;
      applyBtn.textContent = 'Saving Slots...';

      for (const item of itemsToSave) {
        await apiClient.post('/admin/timetable', item);
      }

      triggerToastNotification('Timetable Imported', `Successfully imported ${itemsToSave.length} slots into the schedule.`);
      closeModal();
      renderTimetableTab(parentContainer);
    } catch (err: any) {
      triggerToastNotification('Import Failed', err.message, 'danger');
      const applyBtn = bodyContainer.querySelector('#btn-apply-bulk') as HTMLButtonElement;
      applyBtn.disabled = false;
      applyBtn.textContent = 'Apply Timetable to Database';
    }
  });
}
