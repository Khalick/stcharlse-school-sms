import { getDb } from '../data/mockDb';
import { triggerToastNotification } from './simulatorBar';
import { apiClient } from '../data/apiClient';
import { renderStudentsTab } from './admin/studentsTab.js';

// Keep track of active tab in teacher portal
let activeTeacherTab: 'attendance' | 'students' | 'materials' = 'attendance';

// Keep track of unsaved checklist state before submission: studentId -> 'present' | 'absent'
let currentMorningAttendance: Record<string, 'present' | 'absent'> = {};
let currentEveningAttendance: Record<string, 'present' | 'absent'> = {};

export async function renderTeacherPortal(container: HTMLElement): Promise<void> {
  const db = getDb();
  
  // Use the authenticated user's ID — each teacher only sees their own workspace
  const loggedInTeacherId = db.currentUser?.id;
  if (!loggedInTeacherId) return;
  
  try {
    // 1. Fetch the logged-in teacher's profile from the backend
    const teachers = await apiClient.get<any[]>('/teachers');
    const teacher = teachers.find(t => t.id === loggedInTeacherId);
    
    if (!teacher) {
      container.innerHTML = `<div style="padding:24px; text-align:center;"><h3 style="color:var(--crimson);">Teacher profile not found</h3><p style="color:var(--text-light);">Your account (${loggedInTeacherId}) could not be matched to a teacher record.</p></div>`;
      return;
    }
    
    // 2. Fetch students assigned to this teacher's stream/class
    const streamStudents = await apiClient.get<any[]>(`/teachers/${teacher.id}/students`);
    
    // Initialize checklist state if empty
    streamStudents.forEach(s => {
      if (!currentMorningAttendance[s.id]) currentMorningAttendance[s.id] = 'present';
      if (!currentEveningAttendance[s.id]) currentEveningAttendance[s.id] = 'present';
    });
    
    // 3. Query today's register state from the real database
    const registerState = await apiClient.get<any>(`/attendance/today?teacherId=${teacher.id}`);
    const morningReg = registerState.morning;
    const eveningReg = registerState.evening;
    
    const isMorningSubmitted = morningReg !== null;
    const isEveningSubmitted = eveningReg !== null;
    
    // Check if evening lock is active: virtual clock is after 3:30 PM (930 mins) and evening register is NOT submitted
    const currentTime = db.simulatedTime;
    const isEveningLockActive = currentTime >= 930 && !isEveningSubmitted;
    
    // 4. Fetch study materials published by this specific teacher
    const teacherMaterials = await apiClient.get<any[]>(`/materials?authorId=${teacher.id}`);

    container.innerHTML = `
      <!-- Teacher Workspace Header -->
      <div class="user-switch-bar">
        <div class="workspace-header-text">
          <h2>${teacher.name}'s Workspace</h2>
          <p>Assigned Class: <strong>${teacher.stream}</strong> | Department: <strong>${teacher.subject}</strong></p>
        </div>
      </div>

      <!-- Workspace Tab Selector -->
      <div class="admin-tabs">
        <button class="admin-tab-btn ${activeTeacherTab === 'attendance' ? 'active' : ''}" data-tab="attendance">Attendance Registers</button>
        <button class="admin-tab-btn ${activeTeacherTab === 'students' ? 'active' : ''}" data-tab="students">Students Roster</button>
        <button class="admin-tab-btn ${activeTeacherTab === 'materials' ? 'active' : ''}" data-tab="materials">Study Resources</button>
      </div>

      <div id="teacher-active-tab-panel" style="margin-top: 20px;"></div>
    `;

    const tabPanel = container.querySelector('#teacher-active-tab-panel') as HTMLElement;

    if (activeTeacherTab === 'attendance') {
      tabPanel.innerHTML = `
        <div class="dashboard-grid" style="margin-top: 0;">
          <!-- Twice-Daily Attendance: Morning Check-In -->
          <section class="card col-6 relative-card">
            <h2 class="card-title" style="margin-bottom:12px;">Morning Check-In Register</h2>
            <p style="font-size:0.85rem; color:var(--text-light); margin-bottom:16px;">
              Submit safe arrival roll by <strong>8:30 AM</strong>. Late submissions are automatically flagged on the Admin board.
            </p>

            ${isMorningSubmitted ? `
              <div style="background:var(--green-bg); color:var(--green); padding:16px; border-radius:12px; text-align:center; border:1px solid rgba(16,185,129,0.2);">
                <span style="font-size:2rem; display:block; margin-bottom:6px;">✓</span>
                <strong>Morning Register Completed</strong><br>
                Submitted at ${morningReg.submittedAt} today.
              </div>
            ` : `
              <div class="register-container">
                ${streamStudents.map(student => `
                  <div class="register-row ${currentMorningAttendance[student.id] === 'absent' ? 'absent' : 'present'}">
                    <div class="student-info">
                      <h4>${student.name}</h4>
                      <p>ID: ${student.id}</p>
                    </div>
                    <div class="attendance-toggle-grp">
                      <button class="attendance-toggle-btn morning-toggle ${currentMorningAttendance[student.id] === 'present' ? 'present-active' : ''}" data-student-id="${student.id}" data-status="present">Present</button>
                      <button class="attendance-toggle-btn morning-toggle ${currentMorningAttendance[student.id] === 'absent' ? 'absent-active' : ''}" data-student-id="${student.id}" data-status="absent">Absent</button>
                    </div>
                  </div>
                `).join('')}
                
                <button class="btn-primary" id="btn-submit-morning" style="margin-top:12px; width:100%; justify-content:center;">
                  Submit Morning Check-In Roll
                </button>
              </div>
            `}
          </section>

          <!-- Twice-Daily Attendance: Evening Check-Out -->
          <section class="card col-6 relative-card">
            <h2 class="card-title" style="margin-bottom:12px;">Evening Check-Out Register</h2>
            <p style="font-size:0.85rem; color:var(--text-light); margin-bottom:16px;">
              Submit student departure roll by <strong>4:00 PM</strong> before leaving the school grounds.
            </p>

            ${isEveningSubmitted ? `
              <div style="background:var(--green-bg); color:var(--green); padding:16px; border-radius:12px; text-align:center; border:1px solid rgba(16,185,129,0.2);">
                <span style="font-size:2rem; display:block; margin-bottom:6px;">✓</span>
                <strong>Evening Register Completed</strong><br>
                Submitted at ${eveningReg.submittedAt} today.
              </div>
            ` : `
              <!-- Must submit morning register first -->
              ${!isMorningSubmitted ? `
                <div class="lock-screen-overlay" style="border-radius:16px;">
                  <div class="lock-screen-title">Morning Roll Required First</div>
                  <div class="lock-screen-desc">Please complete and submit the Morning Check-In register before unlocking the Evening Check-Out sheet.</div>
                </div>
              ` : ''}

              <div class="register-container">
                ${streamStudents.map(student => `
                  <div class="register-row ${currentEveningAttendance[student.id] === 'absent' ? 'absent' : 'present'}">
                    <div class="student-info">
                      <h4>${student.name}</h4>
                      <p>ID: ${student.id}</p>
                    </div>
                    <div class="attendance-toggle-grp">
                      <button class="attendance-toggle-btn evening-toggle ${currentEveningAttendance[student.id] === 'present' ? 'present-active' : ''}" data-student-id="${student.id}" data-status="present">Present</button>
                      <button class="attendance-toggle-btn evening-toggle ${currentEveningAttendance[student.id] === 'absent' ? 'absent-active' : ''}" data-student-id="${student.id}" data-status="absent">Absent</button>
                    </div>
                  </div>
                `).join('')}
                
                <button class="btn-primary" id="btn-submit-evening" style="margin-top:12px; width:100%; justify-content:center;">
                  Submit Evening Check-Out Roll
                </button>
              </div>
            `}
          </section>
        </div>
      `;
      bindTeacherEvents(container, teacher, streamStudents);
    } else if (activeTeacherTab === 'students') {
      tabPanel.innerHTML = `
        <div style="position:relative; width:100%;">
          ${isEveningLockActive ? `
            <div class="lock-screen-overlay" style="z-index: 10; border-radius: 16px;">
              <div class="lock-screen-title">Workspace Locked: Evening Register Required!</div>
              <div class="lock-screen-desc">It is past 3:30 PM. To comply with St. Charles safety policies, other panels are locked until the <strong>Evening Check-Out</strong> register is submitted.</div>
            </div>
          ` : ''}
          <div id="teacher-students-inner"></div>
        </div>
      `;
      const innerContainer = tabPanel.querySelector('#teacher-students-inner') as HTMLElement;
      await renderStudentsTab(innerContainer);
    } else if (activeTeacherTab === 'materials') {
      tabPanel.innerHTML = `
        <section class="card col-12 relative-card" id="publisher-section" style="position:relative;">
          <!-- Interactive Evening Lock Overlay -->
          ${isEveningLockActive ? `
            <div class="lock-screen-overlay" style="border-radius:16px;">
              <div class="lock-screen-title">Workspace Locked: Evening Register Required!</div>
              <div class="lock-screen-desc">It is past 3:30 PM. To comply with St. Charles safety policies, other panels are locked until the <strong>Evening Check-Out</strong> register is submitted.</div>
            </div>
          ` : ''}

          <div class="dashboard-grid" style="margin-top: 0;">
            <!-- Upload Form -->
            <div class="col-6">
              <h2 class="card-title" style="margin-bottom:16px;">Publish Course Notes & Resources</h2>
              <form id="material-upload-form" style="display:flex; flex-direction:column; gap:12px;">
                <div class="form-group">
                  <label for="material-title">Document Title</label>
                  <input type="text" id="material-title" class="form-control" placeholder="e.g. Science: Human Blood Circulation" required>
                </div>
                <div class="form-group">
                  <label for="material-content">Study Document Content (Supports Markdown)</label>
                  <textarea id="material-content" class="form-control" rows="6" placeholder="Write or paste your notes here..." required></textarea>
                </div>
                
                <!-- Drag and drop simulator -->
                <div class="upload-dropzone" id="mock-dropzone">
                  <span class="upload-text" id="dropzone-text">Drag & drop textbook PDF or class handout to attach (Simulated)</span>
                </div>
                
                <div style="display:flex; justify-content:flex-end;">
                  <button type="submit" class="btn-primary">Publish to Student Vault</button>
                </div>
              </form>
            </div>

            <!-- Published Items List -->
            <div class="col-6" style="border-left: 1px solid var(--border); padding-left:24px;">
              <h2 class="card-title" style="margin-bottom:16px;">Your Published Study Resources</h2>
              <div style="display:flex; flex-direction:column; gap:12px; max-height: 380px; overflow-y:auto; padding-right:8px;">
                ${teacherMaterials.map(m => `
                  <div style="background:#FAFBFD; border:1px solid var(--border); padding:12px 16px; border-radius:10px; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                      <h4 style="margin:0; font-size:0.95rem; color:var(--primary);">${m.title}</h4>
                      <p style="margin:2px 0 0 0; font-size:0.75rem; color:var(--text-light);">${m.grade} | ${m.subject}</p>
                    </div>
                    <span class="badge badge-success">Live</span>
                  </div>
                `).join('')}
                ${teacherMaterials.length === 0 ? '<p style="font-size:0.9rem; color:var(--text-light); text-align:center; padding-top:40px;">No documents published yet.</p>' : ''}
              </div>
            </div>
          </div>
        </section>
      `;
      bindTeacherEvents(container, teacher, streamStudents);
    }

    // Bind tab selectors
    container.querySelectorAll('.admin-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = (e.currentTarget as HTMLElement).dataset.tab as 'attendance' | 'students' | 'materials';
        if (tab) {
          activeTeacherTab = tab;
          renderTeacherPortal(container);
        }
      });
    });

  } catch (err: any) {
    console.error('Error rendering teacher portal:', err);
    container.innerHTML = `
      <div style="padding: 24px; text-align:center;">
        <h3 style="color: var(--crimson);">Workspace Synchronize Error</h3>
        <p style="color: var(--text-light); margin-top: 8px;">Failed to synchronize dashboard session with backend: ${err.message}</p>
        <button class="btn-primary" onclick="window.location.reload()" style="margin-top: 16px; margin-inline: auto;">Retry Connection</button>
      </div>
    `;
  }
}

function bindTeacherEvents(container: HTMLElement, teacher: any, streamStudents: any[]): void {

  // Morning Checklist Toggles
  const morningToggles = container.querySelectorAll('.morning-toggle');
  morningToggles.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const studentId = (e.currentTarget as HTMLElement).dataset.studentId;
      const status = (e.currentTarget as HTMLElement).dataset.status as 'present' | 'absent';
      if (studentId && status) {
        currentMorningAttendance[studentId] = status;
        renderTeacherPortal(container);
      }
    });
  });

  // Evening Checklist Toggles
  const eveningToggles = container.querySelectorAll('.evening-toggle');
  eveningToggles.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const studentId = (e.currentTarget as HTMLElement).dataset.studentId;
      const status = (e.currentTarget as HTMLElement).dataset.status as 'present' | 'absent';
      if (studentId && status) {
        currentEveningAttendance[studentId] = status;
        renderTeacherPortal(container);
      }
    });
  });

  // Submit Morning Register
  container.querySelector('#btn-submit-morning')?.addEventListener('click', async () => {
    const db = getDb();
    
    // Build register payload
    const records = streamStudents.map(s => ({
      studentId: s.id,
      status: currentMorningAttendance[s.id] || 'present'
    }));
    
    // Simulate virtual clock timestamp formatting
    const currentHrs = Math.floor(db.simulatedTime / 60) % 24;
    const currentMins = db.simulatedTime % 60;
    const submittedTimeStr = `${currentHrs < 10 ? '0' + currentHrs : currentHrs}:${currentMins < 10 ? '0' + currentMins : currentMins}`;
    
    const payload = {
      session: 'morning',
      teacherId: teacher.id,
      date: new Date().toISOString().split('T')[0],
      submittedAt: submittedTimeStr,
      records
    };
    
    try {
      // POST register payload to backend API
      await apiClient.post('/attendance/register', payload);

      // Simulated Broadcast dispatch if students are absent
      const absentStudents = records.filter(r => r.status === 'absent');
      if (absentStudents.length > 0) {
        for (const absStudent of absentStudents) {
          const studentDetail = streamStudents.find(s => s.id === absStudent.studentId);
          if (studentDetail) {
            // Send automatic notification log to database
            const alertMsg = `Attendance Notice: ${studentDetail.name} was marked ABSENT for Morning Check-In at St. Charles School today. Please confirm safe whereabouts.`;
            
            await apiClient.post('/notifications/log', {
              id: `AUTO_${Date.now()}_${studentDetail.id}`,
              timestamp: submittedTimeStr,
              message: alertMsg,
              channels: {
                whatsapp: { status: 'sent', trace: `Meta API auto-alert sent to ${studentDetail.guardianPhone}` },
                sms: { status: 'sent', trace: `Carrier SMS sent to Safaricom recipient ${studentDetail.guardianPhone}` },
                email: { status: 'delivered', trace: `SMTP notification dispatched to ${studentDetail.guardianEmail}` }
              }
            });
          }
        }
        triggerToastNotification(
          'Attendance Alert Dispatched', 
          `Morning register logged. ${absentStudents.length} absent alerts dispatched to parents automatically via SMS & WhatsApp.`
        );
      } else {
        triggerToastNotification('Register Logged', 'Morning register completed and synchronized to Admin Board.');
      }
      
      renderTeacherPortal(container);
    } catch (err: any) {
      triggerToastNotification('Submission Failed', err.message, 'danger');
    }
  });

  // Submit Evening Register
  container.querySelector('#btn-submit-evening')?.addEventListener('click', async () => {
    const db = getDb();
    
    // Build register payload
    const records = streamStudents.map(s => ({
      studentId: s.id,
      status: currentEveningAttendance[s.id] || 'present'
    }));
    
    // Simulate virtual clock timestamp formatting
    const currentHrs = Math.floor(db.simulatedTime / 60) % 24;
    const currentMins = db.simulatedTime % 60;
    const submittedTimeStr = `${currentHrs < 10 ? '0' + currentHrs : currentHrs}:${currentMins < 10 ? '0' + currentMins : currentMins}`;
    
    const payload = {
      session: 'evening',
      teacherId: teacher.id,
      date: new Date().toISOString().split('T')[0],
      submittedAt: submittedTimeStr,
      records
    };
    
    try {
      // POST register payload to backend API
      await apiClient.post('/attendance/register', payload);
      
      triggerToastNotification('Check-Out Logged', 'Evening register logged successfully. Workspace lock released.');
      renderTeacherPortal(container);
    } catch (err: any) {
      triggerToastNotification('Submission Failed', err.message, 'danger');
    }
  });

  // Mock Dropzone Action
  const dropzone = container.querySelector('#mock-dropzone') as HTMLElement | null;
  const dropText = container.querySelector('#dropzone-text') as HTMLElement | null;
  if (dropzone && dropText) {
    dropzone.addEventListener('click', () => {
      dropText.textContent = '"Biology_Cell_Structure_Hnd.pdf" Attached successfully!';
      dropzone.style.borderColor = 'var(--green)';
      dropzone.style.background = 'rgba(16, 185, 129, 0.02)';
    });
  }

  // Material Upload Form Submit
  const uploadForm = container.querySelector('#material-upload-form');
  uploadForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const titleInput = container.querySelector('#material-title') as HTMLInputElement;
    const contentInput = container.querySelector('#material-content') as HTMLTextAreaElement;
    if (!titleInput || !contentInput) return;
    
    const payload = {
      title: titleInput.value.trim(),
      subject: teacher.subject,
      grade: teacher.stream,
      authorId: teacher.id,
      content: contentInput.value.trim()
    };
    
    try {
      await apiClient.post('/materials', payload);
      
      triggerToastNotification(
        'Resource Published', 
        `Successfully published notes: "${payload.title}" to ${payload.grade} Student study vault.`
      );
      
      // Clear fields
      titleInput.value = '';
      contentInput.value = '';
      if (dropText && dropzone) {
        dropText.textContent = 'Drag & drop textbook PDF or class handout to attach (Simulated)';
        dropzone.style.borderColor = 'var(--border)';
        dropzone.style.background = '#FAFBFD';
      }
      
      renderTeacherPortal(container);
    } catch (err: any) {
      triggerToastNotification('Publish Failed', err.message, 'danger');
    }
  });
}
