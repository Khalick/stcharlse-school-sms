import { getDb } from '../data/mockDb';
import { triggerToastNotification } from './simulatorBar';
import { apiClient } from '../data/apiClient';
import { renderStudentsTab } from './admin/studentsTab.js';

// Keep track of active tab in teacher portal
let activeTeacherTab: 'attendance' | 'students' | 'materials' | 'analytics' | 'reports' = 'attendance';

// Keep track of active workspace selection for teacher
interface WorkspaceOption {
  type: 'class' | 'subject';
  stream: string;
  subject?: string;
  label: string;
}
let activeWorkspace: WorkspaceOption | null = null;
let lastTeacherId = '';

// Keep track of unsaved checklist state before submission: studentId -> 'present' | 'absent'
let currentMorningAttendance: Record<string, 'present' | 'absent'> = {};
let currentEveningAttendance: Record<string, 'present' | 'absent'> = {};

export async function renderTeacherPortal(container: HTMLElement): Promise<void> {
  const db = getDb();
  
  // Use the authenticated user's ID — each teacher only sees their own workspace
  const loggedInTeacherId = db.currentUser?.id;
  if (!loggedInTeacherId) return;
  
  // Reset active workspace if teacher changes
  if (lastTeacherId !== loggedInTeacherId) {
    lastTeacherId = loggedInTeacherId;
    activeWorkspace = null;
  }
  
  try {
    // 1. Fetch the logged-in teacher's profile from the backend
    const teachers = await apiClient.get<any[]>('/teachers');
    const teacher = teachers.find(t => t.id === loggedInTeacherId);
    
    if (!teacher) {
      container.innerHTML = `<div style="padding:24px; text-align:center;"><h3 style="color:var(--crimson);">Teacher profile not found</h3><p style="color:var(--text-light);">Your account (${loggedInTeacherId}) could not be matched to a teacher record.</p></div>`;
      return;
    }

    // 2. Build Workspaces dynamically from fetched teacher profile
    const workspaces: WorkspaceOption[] = [];
    if (teacher.class_teacher_stream) {
      workspaces.push({
        type: 'class',
        stream: teacher.class_teacher_stream,
        label: `Class Teacher: ${teacher.class_teacher_stream}`
      });
    }
    if (teacher.subjects && Array.isArray(teacher.subjects)) {
      teacher.subjects.forEach((a: any) => {
        workspaces.push({
          type: 'subject',
          stream: a.stream,
          subject: a.subject,
          label: `Subject: ${a.subject} (${a.stream})`
        });
      });
    }

    if (!activeWorkspace && workspaces.length > 0) {
      activeWorkspace = workspaces[0];
    }
    
    if (!activeWorkspace) {
      container.innerHTML = `<div style="padding:24px; text-align:center;"><h3 style="color:var(--crimson);">No workspaces found</h3><p style="color:var(--text-light);">You have not been assigned to teach any streams or classes.</p></div>`;
      return;
    }
    
    // 3. Fetch students assigned to this workspace stream
    const streamStudents = await apiClient.get<any[]>(`/teachers/${teacher.id}/students?stream=${encodeURIComponent(activeWorkspace.stream)}`);
    
    // Initialize checklist state if empty
    streamStudents.forEach(s => {
      if (!currentMorningAttendance[s.id]) currentMorningAttendance[s.id] = 'present';
      if (!currentEveningAttendance[s.id]) currentEveningAttendance[s.id] = 'present';
    });
    
    // 4. Query today's register state from the real database (based on target stream)
    const registerState = await apiClient.get<any>(`/attendance/today?teacherId=${teacher.id}&stream=${encodeURIComponent(activeWorkspace.stream)}`);
    const morningReg = registerState.morning;
    const eveningReg = registerState.evening;
    
    const isMorningSubmitted = morningReg !== null;
    const isEveningSubmitted = eveningReg !== null;
    
    // Check if evening lock is active
    const currentTime = db.simulatedTime;
    const isEveningLockActive = currentTime >= 930 && !isEveningSubmitted && activeWorkspace.type === 'class';
    
    // 5. Fetch study materials published by this specific teacher
    const teacherMaterials = await apiClient.get<any[]>(`/materials?authorId=${teacher.id}`);

    // Build Switcher dropdown HTML
    let switcherHtml = '';
    if (workspaces.length > 1) {
      switcherHtml = `
        <div class="workspace-switcher-wrapper" style="margin-left: auto; display: flex; align-items: center; gap: 8px;">
          <label for="workspace-select" style="font-weight: 600; font-size: 0.85rem; color: var(--text-light);">Active Workspace:</label>
          <select id="workspace-select" class="form-control" style="width: auto; padding: 6px 12px; font-family: inherit; font-size: 0.85rem;">
            ${workspaces.map(w => `
              <option value="${w.label}" ${activeWorkspace?.label === w.label ? 'selected' : ''}>${w.label}</option>
            `).join('')}
          </select>
        </div>
      `;
    }

    container.innerHTML = `
      <!-- Teacher Workspace Header -->
      <div class="user-switch-bar">
        <div class="workspace-header-text">
          <h2>${teacher.name}'s Workspace</h2>
          <p>Current Role: <strong>${activeWorkspace.label}</strong></p>
        </div>
        ${switcherHtml}
      </div>

      <!-- Workspace Tab Selector -->
      <div class="admin-tabs">
        ${activeWorkspace.type === 'class' ? `
          <button class="admin-tab-btn ${activeTeacherTab === 'attendance' ? 'active' : ''}" data-tab="attendance">Attendance Registers</button>
        ` : ''}
        <button class="admin-tab-btn ${activeTeacherTab === 'students' ? 'active' : ''}" data-tab="students">Students Roster</button>
        <button class="admin-tab-btn ${activeTeacherTab === 'materials' ? 'active' : ''}" data-tab="materials">Study Resources</button>
        <button class="admin-tab-btn ${activeTeacherTab === 'analytics' ? 'active' : ''}" data-tab="analytics">Student Analytics</button>
        <button class="admin-tab-btn ${activeTeacherTab === 'reports' ? 'active' : ''}" data-tab="reports">Report Cards</button>
      </div>

      <div id="teacher-active-tab-panel" style="margin-top: 20px;"></div>
    `;

    // Bind Workspace switch event
    container.querySelector('#workspace-select')?.addEventListener('change', (e) => {
      const selectedLabel = (e.target as HTMLSelectElement).value;
      const match = workspaces.find(w => w.label === selectedLabel);
      if (match) {
        activeWorkspace = match;
        // Kick out of attendance tab if they switched to a subject workspace
        if (activeWorkspace.type === 'subject' && activeTeacherTab === 'attendance') {
          activeTeacherTab = 'students';
        }
        // Keep active tab, but force reload data
        renderTeacherPortal(container);
      }
    });

    const tabPanel = container.querySelector('#teacher-active-tab-panel') as HTMLElement;

    if (activeTeacherTab === 'attendance') {
      if (activeWorkspace.type === 'subject') {
        tabPanel.innerHTML = `
          <div style="background:#FAFBFD; border:1px solid var(--border); padding:40px; border-radius:12px; text-align:center;">
            <span style="font-size:3rem; display:block; margin-bottom:12px;">🔒</span>
            <h3 style="margin-bottom:8px; color:var(--primary);">Attendance Sheet Restricted</h3>
            <p style="color:var(--text-light); font-size:0.9rem; max-width:480px; margin:0 auto 16px auto;">
              Only the designated Class Teacher is authorized to record twice-daily registers for <strong>${activeWorkspace.stream}</strong>.
            </p>
          </div>
        `;
      } else {
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

          <!-- Weekly Summary Grid -->
          <section class="card col-12" style="margin-top: 24px;">
            <div class="card-header-with-action" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
              <h2 class="card-title" style="margin: 0;">Weekly Register Overview</h2>
              <div style="font-weight: 500; font-size: 0.85rem; color: var(--text-light);" id="teacher-week-heading">
                Loading weekly summary...
              </div>
            </div>
            <div id="teacher-weekly-grid-container" class="table-wrapper">
              <p style="text-align:center; color:var(--text-light); padding: 12px 0; margin: 0;">Loading weekly grid...</p>
            </div>
          </section>
        `;
        bindTeacherEvents(container, teacher, streamStudents);
        loadTeacherWeeklyGrid(tabPanel, activeWorkspace.stream);
      }
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
      await renderStudentsTab(innerContainer, activeWorkspace.stream, activeWorkspace.type === 'subject');
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
                <input type="file" id="material-file-input" style="display:none;" />
                <div class="upload-dropzone" id="mock-dropzone" style="cursor:pointer; border: 2px dashed var(--border); padding: 24px; border-radius: 12px; text-align: center; background: #FAFBFD; transition: all 0.2s ease;">
                  <span class="upload-text" id="dropzone-text" style="font-size:0.85rem; color:var(--text-light); pointer-events:none;">Drag & drop or click to browse files (Simulated)</span>
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
    } else if (activeTeacherTab === 'analytics') {
      const totalStudents = streamStudents.length;
      const avgAttendance = totalStudents > 0 ? Math.round(streamStudents.reduce((sum, s) => sum + (s.attendanceRate || 0), 0) / totalStudents) : 0;
      
      const atRiskStudents = streamStudents.filter(s => (s.attendanceRate || 0) < 75 || (s.xp_points || 0) < 50);
      const topPerformers = [...streamStudents].sort((a, b) => (b.xp_points || 0) - (a.xp_points || 0)).slice(0, 3);
      
      tabPanel.innerHTML = `
        <section class="card col-12 relative-card">
          <h2 class="card-title" style="margin-bottom:12px;">Predictive Mastery Analytics</h2>
          <p style="color:var(--text-light); font-size:0.9rem; margin-bottom:24px;">AI-driven performance and risk calculations for <strong>${activeWorkspace.stream}</strong>.</p>
          
          <div style="display:flex; flex-wrap:wrap; gap:20px; margin-bottom: 24px;">
            <div style="flex:1; min-width:250px; background:linear-gradient(135deg, #e0f7fa 0%, #b2ebf2 100%); border:1px solid var(--border); border-radius:12px; padding:24px; text-align:center; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
              <h4 style="color:var(--primary-dark); margin-bottom:8px; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 1px;">Class Average Attendance</h4>
              <div style="font-size:3rem; font-weight:700; color:var(--primary);">${avgAttendance}%</div>
            </div>
            <div style="flex:1; min-width:250px; background:linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%); border:1px solid var(--border); border-radius:12px; padding:24px; text-align:center; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
              <h4 style="color:#c62828; margin-bottom:8px; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 1px;">At-Risk Students</h4>
              <div style="font-size:3rem; font-weight:700; color:#b71c1c;">${atRiskStudents.length}</div>
              <p style="color:#d32f2f; font-size:0.8rem; margin-top:8px;">Requires intervention</p>
            </div>
          </div>
          
          <div style="display:flex; flex-wrap:wrap; gap:20px;">
            <div style="flex:1; min-width: 300px;">
              <h4 style="margin-bottom: 12px; color: var(--primary);">🏆 Top Performers (XP)</h4>
              <ul style="list-style: none; padding: 0;">
                ${topPerformers.length > 0 ? topPerformers.map((s, i) => `
                  <li style="display:flex; justify-content:space-between; padding: 12px; background: #fafafa; border-radius: 8px; margin-bottom: 8px; border-left: 4px solid var(--gold);">
                    <span style="font-weight: 600;">${i+1}. ${s.name}</span>
                    <span style="color: var(--primary); font-weight: 700;">⭐ ${s.xp_points || 0} XP</span>
                  </li>
                `).join('') : '<li style="padding:12px; color:var(--text-light); font-size:0.9rem;">No data available.</li>'}
              </ul>
            </div>
            
            <div style="flex:1; min-width: 300px;">
              <h4 style="margin-bottom: 12px; color: #c62828;">⚠️ Action Required</h4>
              <ul style="list-style: none; padding: 0;">
                ${atRiskStudents.length > 0 ? atRiskStudents.map(s => `
                  <li style="display:flex; flex-direction:column; padding: 12px; background: #fff5f5; border-radius: 8px; margin-bottom: 8px; border-left: 4px solid #f44336;">
                    <strong style="color: #d32f2f;">${s.name} (${s.id})</strong>
                    <span style="font-size:0.85rem; color: #7f0000; margin-top: 4px;">Attendance: ${s.attendanceRate || 0}% | XP: ${s.xp_points || 0}</span>
                  </li>
                `).join('') : '<li style="padding:12px; color:var(--text-light); font-size:0.9rem;">All students are performing well!</li>'}
              </ul>
            </div>
          </div>
        </section>
      `;
    } else if (activeTeacherTab === 'reports') {
      tabPanel.innerHTML = `
        <section class="card col-12 relative-card">
          <h2 class="card-title" style="margin-bottom:12px;">Automated Report Cards</h2>
          <p style="color:var(--text-light); font-size:0.9rem; margin-bottom:24px;">Generate end-of-term academic reports for students in <strong>${activeWorkspace.stream}</strong>.</p>
          
          <div class="table-wrapper">
            <table class="premium-table">
              <thead>
                <tr>
                  <th>Student Name</th>
                  <th>ID</th>
                  <th>Term Average</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${streamStudents.slice(0, 5).map(student => `
                  <tr>
                    <td>${student.name}</td>
                    <td><strong>${student.id}</strong></td>
                    <td>--</td>
                    <td><span class="badge badge-warning" style="background:#FEF3C7; color:#D97706;" data-status-id="${student.id}">Pending Grades</span></td>
                    <td><button class="btn-action" data-action="draft-report" data-id="${student.id}" style="font-size:0.8rem;">Draft Report</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </section>
        <div id="teacher-modal-container"></div>
      `;
      
      // Bind Draft Report buttons
      const mc = tabPanel.querySelector('#teacher-modal-container') as HTMLElement;
      tabPanel.querySelectorAll('[data-action="draft-report"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const studentId = (e.currentTarget as HTMLElement).dataset.id;
          const student = streamStudents.find(s => s.id === studentId);
          if (student && activeWorkspace) showDraftReportModal(mc, student, activeWorkspace.stream);
        });
      });
    }

    // Bind tab selectors
    container.querySelectorAll('.admin-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = (e.currentTarget as HTMLElement).dataset.tab as any;
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
    if (!activeWorkspace) return;
    
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
      records,
      stream: activeWorkspace.stream
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
    if (!activeWorkspace) return;
    
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
      records,
      stream: activeWorkspace.stream
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
  const fileInput = container.querySelector('#material-file-input') as HTMLInputElement | null;
  
  if (dropzone && dropText && fileInput) {
    dropzone.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        dropText.textContent = `"${file.name}" attached successfully!`;
        dropzone.style.borderColor = 'var(--green)';
        dropzone.style.background = 'rgba(16, 185, 129, 0.02)';
      }
    });

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'var(--primary)';
      dropzone.style.background = 'rgba(79, 70, 229, 0.02)';
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.style.borderColor = 'var(--border)';
      dropzone.style.background = '#FAFBFD';
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        dropText.textContent = `"${file.name}" attached successfully!`;
        dropzone.style.borderColor = 'var(--green)';
        dropzone.style.background = 'rgba(16, 185, 129, 0.02)';
      }
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
      subject: (activeWorkspace && activeWorkspace.subject) ? activeWorkspace.subject : (teacher.subjects && teacher.subjects.length > 0 ? teacher.subjects[0].subject : 'General'),
      grade: activeWorkspace ? activeWorkspace.stream : (teacher.class_teacher_stream || 'General'),
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

async function loadTeacherWeeklyGrid(container: HTMLElement, stream: string) {
  const gridContainer = container.querySelector('#teacher-weekly-grid-container');
  const headingContainer = container.querySelector('#teacher-week-heading');
  if (!gridContainer) return;

  function getMonday(d: Date): Date {
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  }

  function formatDateStr(d: Date): string {
    return d.toISOString().split('T')[0];
  }

  function formatDisplayDate(dateStr: string): string {
    const [, m, d] = dateStr.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d} ${months[parseInt(m) - 1]}`;
  }

  const weekStart = getMonday(new Date());
  const weekStartStr = formatDateStr(weekStart);
  const fridayDate = new Date(weekStart);
  fridayDate.setDate(weekStart.getDate() + 4);
  const displayHeading = `Week of ${formatDisplayDate(weekStartStr)} — ${formatDisplayDate(formatDateStr(fridayDate))}`;

  if (headingContainer) headingContainer.textContent = displayHeading;

  try {
    const data = await apiClient.get<{ dates: string[]; grid: any[] }>(
      `/attendance/weekly-grid?stream=${encodeURIComponent(stream)}&weekStart=${weekStartStr}`
    );

    gridContainer.innerHTML = `
      <table class="premium-table">
        <thead>
          <tr>
            <th rowspan="2" style="text-align: left; vertical-align: middle;">Student Name</th>
            <th colspan="2" style="text-align: center;">Monday</th>
            <th colspan="2" style="text-align: center;">Tuesday</th>
            <th colspan="2" style="text-align: center;">Wednesday</th>
            <th colspan="2" style="text-align: center;">Thursday</th>
            <th colspan="2" style="text-align: center;">Friday</th>
            <th colspan="2" style="text-align: center; border-left: 2px solid var(--border);">Totals</th>
          </tr>
          <tr>
            <th style="text-align: center; font-size: 0.7rem; color: var(--text-light); width: 35px;">M</th>
            <th style="text-align: center; font-size: 0.7rem; color: var(--text-light); width: 35px;">A</th>
            <th style="text-align: center; font-size: 0.7rem; color: var(--text-light); width: 35px;">M</th>
            <th style="text-align: center; font-size: 0.7rem; color: var(--text-light); width: 35px;">A</th>
            <th style="text-align: center; font-size: 0.7rem; color: var(--text-light); width: 35px;">M</th>
            <th style="text-align: center; font-size: 0.7rem; color: var(--text-light); width: 35px;">A</th>
            <th style="text-align: center; font-size: 0.7rem; color: var(--text-light); width: 35px;">M</th>
            <th style="text-align: center; font-size: 0.7rem; color: var(--text-light); width: 35px;">A</th>
            <th style="text-align: center; font-size: 0.7rem; color: var(--text-light); width: 35px;">M</th>
            <th style="text-align: center; font-size: 0.7rem; color: var(--text-light); width: 35px;">A</th>
            <th style="text-align: center; font-size: 0.7rem; font-weight: 600; color: var(--green); border-left: 2px solid var(--border); width: 35px;">P</th>
            <th style="text-align: center; font-size: 0.7rem; font-weight: 600; color: var(--crimson); width: 35px;">A</th>
          </tr>
        </thead>
        <tbody>
          ${data.grid.map(row => {
            let presentCount = 0;
            let absentCount = 0;

            const renderCell = (dateStr: string, session: 'morning' | 'evening') => {
              const status = row.attendance[dateStr]?.[session];
              if (status === 'present') {
                presentCount++;
                return `<span style="color: var(--green); font-weight: bold;">✓</span>`;
              } else if (status === 'absent') {
                absentCount++;
                return `<span style="color: var(--crimson); font-weight: bold;">A</span>`;
              }
              return `<span style="color: var(--text-light); opacity: 0.3;">-</span>`;
            };

            return `
              <tr>
                <td style="text-align: left; font-weight: 500;">${row.name}</td>
                <td style="text-align: center;">${renderCell(data.dates[0], 'morning')}</td>
                <td style="text-align: center;">${renderCell(data.dates[0], 'evening')}</td>
                <td style="text-align: center;">${renderCell(data.dates[1], 'morning')}</td>
                <td style="text-align: center;">${renderCell(data.dates[1], 'evening')}</td>
                <td style="text-align: center;">${renderCell(data.dates[2], 'morning')}</td>
                <td style="text-align: center;">${renderCell(data.dates[2], 'evening')}</td>
                <td style="text-align: center;">${renderCell(data.dates[3], 'morning')}</td>
                <td style="text-align: center;">${renderCell(data.dates[3], 'evening')}</td>
                <td style="text-align: center;">${renderCell(data.dates[4], 'morning')}</td>
                <td style="text-align: center;">${renderCell(data.dates[4], 'evening')}</td>
                <td style="text-align: center; border-left: 2px solid var(--border); font-weight: 600; color: var(--green); background: rgba(16,185,129,0.02);">${presentCount}</td>
                <td style="text-align: center; font-weight: 600; color: var(--crimson); background: rgba(239,68,68,0.02);">${absentCount}</td>
              </tr>
            `;
          }).join('')}
          ${data.grid.length === 0 ? `
            <tr>
              <td colspan="13" style="text-align:center; padding:12px; color:var(--text-light)">
                No student records found.
              </td>
            </tr>
          ` : ''}
        </tbody>
      </table>
    `;
  } catch (err: any) {
    gridContainer.innerHTML = `<p style="text-align:center; color:var(--crimson); padding:12px 0; margin:0;">Failed to load grid: ${err.message}</p>`;
  }
}

function showDraftReportModal(container: HTMLElement, student: any, stream: string) {
  let subjects: string[] = [];
  if (stream.startsWith('Pre') || stream === 'Grade 1' || stream === 'Grade 2' || stream === 'Grade 3') {
    subjects = ['Mathematics Activities', 'English Language Activities', 'Kiswahili Language Activities', 'Environmental Activities', 'Hygiene and Nutrition Activities', 'CRE / IRE / HRE', 'Movement and Creative Activities'];
  } else if (stream === 'Grade 4' || stream === 'Grade 5' || stream === 'Grade 6') {
    subjects = ['Mathematics', 'English', 'Kiswahili', 'Science and Technology', 'Agriculture', 'Home Science', 'Creative Arts', 'Physical and Health Education', 'CRE / IRE / HRE', 'Social Studies'];
  } else {
    subjects = ['English', 'Kiswahili', 'Mathematics', 'Integrated Science', 'Health Education', 'Pre-Technical and Pre-Career Education', 'Social Studies', 'Religious Education', 'Business Studies', 'Agriculture', 'Life Skills Education', 'Sports and Physical Education'];
  }

  container.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-content" style="max-width: 600px;">
        <div class="modal-header">
          <h3>Draft Report Card: ${student.name}</h3>
          <button class="modal-close-btn" id="close-report-modal">×</button>
        </div>
        <form id="report-form">
          <div class="modal-body" style="max-height: 60vh; overflow-y: auto;">
            <div style="display:flex; gap:12px; margin-bottom: 16px;">
              <div class="form-group" style="flex:1;">
                <label>Academic Term</label>
                <select id="report-term" class="form-control" required>
                  <option value="Term 1">Term 1</option>
                  <option value="Term 2">Term 2</option>
                  <option value="Term 3">Term 3</option>
                </select>
              </div>
              <div class="form-group" style="flex:1;">
                <label>Academic Year</label>
                <input type="number" id="report-year" class="form-control" value="${new Date().getFullYear()}" required>
              </div>
            </div>

            <h4 style="margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 4px;">Subject Grades (0-100)</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
              ${subjects.map(sub => `
                <div class="form-group">
                  <label style="font-size: 0.8rem;">${sub}</label>
                  <input type="number" class="form-control report-score-input" data-subject="${sub}" min="0" max="100" placeholder="Score">
                </div>
              `).join('')}
            </div>

            <div class="form-group">
              <label>Class Teacher Remarks</label>
              <textarea id="report-comments" class="form-control" rows="3" placeholder="Enter overall performance remarks..."></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn-secondary" id="cancel-report-modal">Cancel</button>
            <button type="submit" class="btn-primary">Save Draft Report</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const close = () => { container.innerHTML = ''; };
  container.querySelector('#close-report-modal')?.addEventListener('click', close);
  container.querySelector('#cancel-report-modal')?.addEventListener('click', close);

  container.querySelector('#report-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const grades: Record<string, number> = {};
    container.querySelectorAll('.report-score-input').forEach((input: any) => {
      if (input.value) {
        grades[input.dataset.subject] = Number(input.value);
      }
    });

    const payload = {
      studentId: student.id,
      stream: stream,
      term: (container.querySelector('#report-term') as HTMLSelectElement).value,
      year: parseInt((container.querySelector('#report-year') as HTMLInputElement).value, 10),
      comments: (container.querySelector('#report-comments') as HTMLTextAreaElement).value.trim(),
      grades
    };

    try {
      await apiClient.post('/reports', payload);
      
      // Optimistically update UI status
      const reportStatusBadge = document.getElementById(`report-status-${student.id}`);
      if (reportStatusBadge) {
        reportStatusBadge.textContent = 'Draft Saved';
        reportStatusBadge.style.color = '#065F46';
        reportStatusBadge.style.backgroundColor = '#D1FAE5';
      }
      
      triggerToastNotification('Report Saved', 'Student report card drafted successfully.', 'info');
      close();
      
      const btn = document.querySelector(`[data-action="draft-report"][data-id="${student.id}"]`);
      if (btn) {
        const row = btn.closest('tr');
        if (row) {
          const badge = row.querySelector(`[data-status-id="${student.id}"]`);
          if (badge) {
            badge.className = 'badge badge-success';
            badge.textContent = 'Draft Saved';
            badge.setAttribute('style', 'background:#D1FAE5; color:#065F46;');
          }
          btn.textContent = 'Edit Report';
        }
      }
    } catch (err: any) {
      triggerToastNotification('Error', 'Failed to save report: ' + err.message, 'danger');
    }
  });
}
