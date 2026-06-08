import { getDb } from '../../data/mockDb';
import { triggerToastNotification } from '../simulatorBar';
import { playWarningChime } from '../../lib/audioService';
import { apiClient } from '../../data/apiClient';

export async function renderDashboardTab(container: HTMLElement): Promise<void> {
  const db = getDb();
  const stats = await apiClient.get<any>('/admin/metrics');
  const teachersSummary = await apiClient.get<any[]>('/admin/registers-summary');
  const timetable = await apiClient.get<any[]>('/admin/timetable');
  const commLogs = await apiClient.get<any[]>('/notifications/logs');
  
  // Fetch all students to support specific parent selection dropdown
  let allStudents: any[] = [];
  try {
    allStudents = await apiClient.get<any[]>('/students');
  } catch (err) {
    console.error('Failed to load students for broadcaster:', err);
  }

  container.innerHTML = `
    <div class="stats-strip">
      <div class="stat-item"><span class="stat-label">Total Enrollment</span><span class="stat-value">${stats.totalStudents} Students</span></div>
      <div class="stat-item"><span class="stat-label">Daily Attendance Rate</span><span class="stat-value">${stats.todayAttendanceRate}% Present</span></div>
      <div class="stat-item"><span class="stat-label">Completed Registers</span><span class="stat-value">${stats.loggedRegistersCount} / ${stats.totalExpectedRegisters} Logged</span></div>
    </div>
    <div class="dashboard-grid">
      <section class="card col-8">
        <div class="card-header-with-action">
          <h2 class="card-title">Twice-Daily Teacher Attendance Tracker</h2>
          <span style="font-size:0.8rem;color:var(--text-light)">Morning: 8:30 AM | Evening: 4:00 PM</span>
        </div>
        <div class="table-wrapper"><table class="premium-table"><thead><tr><th>Teacher</th><th>Assigned Class</th><th>Morning Check-In</th><th>Evening Check-Out</th></tr></thead>
        <tbody>${renderCheckoutRows(teachersSummary, db.simulatedTime)}</tbody></table></div>
      </section>
      <section class="card col-4">
        <h2 class="card-title" style="margin-bottom:16px;">Today's Schedule</h2>
        <div class="timeline-list">${renderTimeline(timetable)}</div>
      </section>
      <section class="card col-6">
        <h2 class="card-title" style="margin-bottom:12px;">Multi-Channel Parental Broadcaster</h2>
        <p style="font-size:0.85rem;color:var(--text-light);margin-bottom:20px;">Compose one announcement dispatched via WhatsApp, Safaricom SMS, and Email.</p>
        <form id="broadcast-form" style="display:flex;flex-direction:column;gap:12px;">
          <div class="form-group">
            <label for="broadcast-target-type">Target Audience</label>
            <select id="broadcast-target-type" class="form-control" style="font-family: inherit;">
              <option value="all">All Grades (PP1 to Grade 9)</option>
              <option value="grade">Specific Grade Level</option>
              <option value="student">Specific Student's Parent</option>
            </select>
          </div>
          
          <div class="form-group" id="group-grade-select" style="display:none;">
            <label for="broadcast-grade-select">Select Grade Level</label>
            <select id="broadcast-grade-select" class="form-control" style="font-family: inherit;">
              ${['Pre-Primary 1', 'Pre-Primary 2', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7A', 'Grade 8', 'Grade 9'].map(g => `<option value="${g}">${g}</option>`).join('')}
            </select>
          </div>

          <div class="form-group" id="group-student-select" style="display:none;">
            <label for="broadcast-student-select">Select Student (Parent/Guardian)</label>
            <select id="broadcast-student-select" class="form-control" style="font-family: inherit;">
              ${allStudents.map(s => `<option value="${s.id}">${s.name} (${s.stream}) — Parent: ${s.guardianName}</option>`).join('')}
              ${allStudents.length === 0 ? '<option value="">No students available</option>' : ''}
            </select>
          </div>

          <div class="form-group"><label for="broadcast-message">Announcement Message</label>
          <textarea id="broadcast-message" class="form-control" rows="5" placeholder="Dear parents, please note..." required></textarea></div>
          
          <div style="display:flex;justify-content:flex-end;"><button type="submit" class="btn-primary">Dispatch 3-Channel Broadcast</button></div>
        </form>
      </section>
      <section class="card col-6">
        <h2 class="card-title" style="margin-bottom:12px;">Live Carrier Gateway Terminal</h2>
        <div class="logs-console" id="admin-gateway-logs">${renderGatewayLogs(commLogs)}</div>
      </section>
    </div>
  `;

  // Handle dynamic form field toggles
  const targetTypeSelect = container.querySelector('#broadcast-target-type') as HTMLSelectElement;
  const gradeSelectGroup = container.querySelector('#group-grade-select') as HTMLElement;
  const studentSelectGroup = container.querySelector('#group-student-select') as HTMLElement;

  targetTypeSelect?.addEventListener('change', () => {
    const val = targetTypeSelect.value;
    if (val === 'grade') {
      gradeSelectGroup.style.display = 'block';
      studentSelectGroup.style.display = 'none';
    } else if (val === 'student') {
      gradeSelectGroup.style.display = 'none';
      studentSelectGroup.style.display = 'block';
    } else {
      gradeSelectGroup.style.display = 'none';
      studentSelectGroup.style.display = 'none';
    }
  });

  // Broadcast handler
  container.querySelector('#broadcast-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ta = container.querySelector('#broadcast-message') as HTMLTextAreaElement;
    if (!ta || !ta.value.trim()) return;
    const msg = ta.value.trim();
    const t = db.simulatedTime;
    const ts = `${String(Math.floor(t/60)%24).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;

    const targetType = targetTypeSelect.value;
    let targetValue = 'all';

    if (targetType === 'grade') {
      targetValue = (container.querySelector('#broadcast-grade-select') as HTMLSelectElement).value;
    } else if (targetType === 'student') {
      targetValue = (container.querySelector('#broadcast-student-select') as HTMLSelectElement).value;
      if (!targetValue) {
        triggerToastNotification('Error', 'Please select a student parent recipient', 'danger');
        return;
      }
    }

    try {
      await apiClient.post('/admin/broadcast', { 
        message: msg, 
        timestamp: ts,
        targetType,
        targetValue
      });
      playWarningChime();
      triggerToastNotification('Broadcast Success', 'Announcement delivered to selected parents via WhatsApp, SMS, and Email.');
      ta.value = '';
      renderDashboardTab(container);
    } catch (err: any) { triggerToastNotification('Broadcast Failed', err.message, 'danger'); }
  });
}

function renderCheckoutRows(summary: any[], currentTime: number): string {
  return summary.map(t => {
    const mHtml = t.morning ? `<span class="badge badge-success">✓ Logged (${t.morning.submittedAt})</span>` : currentTime > 510 ? `<span class="badge badge-danger">LATE</span>` : `<span class="badge badge-warning">Pending</span>`;
    const eHtml = t.evening ? `<span class="badge badge-success">✓ Logged (${t.evening.submittedAt})</span>` : currentTime > 960 ? `<span class="badge badge-danger">LATE</span>` : `<span class="badge badge-warning">Pending</span>`;
    return `<tr><td><strong>${t.teacherName}</strong><br><span style="font-size:0.75rem;color:var(--text-light)">${t.teacherSubject}</span></td><td>${t.assignedStream}</td><td>${mHtml}</td><td>${eHtml}</td></tr>`;
  }).join('');
}

function renderTimeline(events: any[]): string {
  const fmt = (m: number) => `${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
  return events.map(ev => `<div class="timeline-item"><div class="timeline-time">${fmt(ev.start_time)} - ${fmt(ev.end_time)}</div><div class="timeline-details"><h4>${ev.subject} • ${ev.stream}</h4><p>${ev.room} | ${ev.teacher_name}</p></div></div>`).join('');
}

function renderGatewayLogs(logs: any[]): string {
  if (!logs.length) return `<div style="text-align:center;color:#475569;padding:40px 0;">No dispatches logged. Use the broadcaster to fire a test notice.</div>`;
  return logs.map(l => `<div class="log-entry"><span class="log-timestamp">[${l.timestamp}]</span> <strong>Broadcast</strong>: <span style="color:#E2E8F0">"${l.message.substring(0,40)}${l.message.length>40?'...':''}"</span>
    <div style="margin-left:12px;margin-top:4px;font-size:0.75rem;">
      <div><span class="log-meta-tag log-whats">WhatsApp</span> ${l.whatsapp_trace || l.channels?.whatsapp?.trace} [${(l.whatsapp_status || l.channels?.whatsapp?.status || 'SENT').toUpperCase()}]</div>
      <div><span class="log-meta-tag log-sms">SMS</span> ${l.sms_trace || l.channels?.sms?.trace} [${(l.sms_status || l.channels?.sms?.status || 'SENT').toUpperCase()}]</div>
      <div><span class="log-meta-tag log-email">Email</span> ${l.email_trace || l.channels?.email?.trace} [${(l.email_status || l.channels?.email?.status || 'DELIVERED').toUpperCase()}]</div>
    </div></div>`).join('');
}
