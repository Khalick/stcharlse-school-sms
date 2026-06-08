import { getDb, saveDb, formatTime } from '../data/mockDb';
import type { TimetableEvent } from '../data/mockDb';
import { playSchoolBell, playWarningChime } from '../lib/audioService';

let tickInterval: number | null = null;
const triggeredEvents = new Set<string>(); // Keep track of class alerts already fired today

/**
 * Initializes and starts the simulation clock interval.
 */
export function initSimulator(): void {
  const db = getDb();
  
  // Set up tick interval
  if (db.isTimeRunning) {
    startClockInterval(db.timeSpeed);
  }
  
  // Custom listen to trigger events on load
  window.addEventListener('sim-tick', () => {
    checkTimetableAlerts();
    checkRegisterDeadlines();
  });
}

function startClockInterval(speed: number): void {
  if (tickInterval) clearInterval(tickInterval);
  
  tickInterval = window.setInterval(() => {
    const db = getDb();
    
    // Increment time
    db.simulatedTime = (db.simulatedTime + speed) % 1440; // loop day
    
    // If midnight, reset triggered events list
    if (db.simulatedTime < speed) {
      triggeredEvents.clear();
    }
    
    saveDb(db);
    
    // Dispatch event to re-render active UI
    window.dispatchEvent(new CustomEvent('sim-tick', { detail: { time: db.simulatedTime } }));
  }, 1000);
}

function stopClockInterval(): void {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
}

/**
 * Checks if a timetable class starts in exactly 5 minutes, and triggers alerts.
 */
function checkTimetableAlerts(): void {
  const db = getDb();
  const currentTime = db.simulatedTime;
  
  db.timetable.forEach((event: TimetableEvent) => {
    // 5 minutes before class
    const alertTime = event.startTime - 5;
    
    if (currentTime >= alertTime && currentTime < event.startTime) {
      const eventKey = `${event.id}_${event.startTime}`;
      if (!triggeredEvents.has(eventKey)) {
        triggeredEvents.add(eventKey);
        
        // Trigger visual alert, audio alert, and simulated haptic
        const teacher = db.teachers.find(t => t.id === event.teacherId);
        const teacherName = teacher ? teacher.name : 'Teacher';
        
        // Play school bell ringtone
        playSchoolBell();
        
        // Fire toast notification
        triggerToastNotification(
          'Timetable Alert', 
          `Class starting in 5 minutes: ${event.subject} in ${event.room} for ${event.stream} (taught by ${teacherName}).`
        );
        
        // Send a background service worker push notification if active
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.ready.then((registration) => {
            registration.showNotification('St. Charles Class Reminder', {
              body: `${event.subject} starting in 5 minutes in ${event.room}.`,
              icon: '/school_crest_logo.png',
              vibrate: [200, 100, 200],
              tag: 'class-reminder'
            } as any);
          });
        }
      }
    }
  });
}

/**
 * Checks for missing morning (8:30 AM) and evening (4:00 PM) registers and triggers warning chimes.
 */
function checkRegisterDeadlines(): void {
  const db = getDb();
  const time = db.simulatedTime;
  
  // Morning Deadline: exactly 8:31 AM
  if (time === 511) {
    let missingMorningCount = 0;
    db.teachers.forEach(t => {
      const hasMorning = db.registers.some(r => r.teacherId === t.id && r.session === 'morning' && r.submittedAt !== '');
      if (!hasMorning) missingMorningCount++;
    });
    
    if (missingMorningCount > 0) {
      playWarningChime();
      triggerToastNotification(
        'Morning Registry Overdue',
        `Warning: ${missingMorningCount} teachers have not submitted their Morning Check-In register by the 8:30 AM deadline.`,
        'danger'
      );
    }
  }
  
  // Evening Deadline: exactly 4:01 PM (961 mins)
  if (time === 961) {
    let missingEveningCount = 0;
    db.teachers.forEach(t => {
      const hasEvening = db.registers.some(r => r.teacherId === t.id && r.session === 'evening' && r.submittedAt !== '');
      if (!hasEvening) missingEveningCount++;
    });
    
    if (missingEveningCount > 0) {
      playWarningChime();
      triggerToastNotification(
        'Evening Registry Overdue',
        `Warning: ${missingEveningCount} teachers have not completed their Evening Check-Out registers by the 4:00 PM deadline.`,
        'danger'
      );
    }
  }
}

/**
 * Displays a custom on-screen notification alert toast.
 */
export function triggerToastNotification(title: string, message: string, type: 'info' | 'warning' | 'danger' = 'info'): void {
  const container = document.getElementById('toast-container');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = 'toast-alert';
  if (type === 'warning') toast.style.borderLeftColor = 'var(--gold)';
  if (type === 'danger') toast.style.borderLeftColor = 'var(--crimson)';
  
  toast.innerHTML = `
    <div>
      <h4>${title}</h4>
      <p>${message}</p>
    </div>
    <button class="toast-close">Close</button>
  `;
  
  // Bind close button click
  toast.querySelector('.toast-close')?.addEventListener('click', () => {
    toast.remove();
  });
  
  container.appendChild(toast);
  
  // Auto-remove after 6 seconds
  setTimeout(() => {
    toast.remove();
  }, 6000);
}

/**
 * Renders the floating Simulator Bar component in index.html.
 */
export function renderSimulatorBar(): void {
  const container = document.getElementById('simulator-bar');
  if (!container) return;
  
  const db = getDb();
  
  container.innerHTML = `
    <div class="simulator-panel">
      <div class="sim-time-section">
        <span class="sim-clock-display">
          <span id="sim-clock-text">${formatTime(db.simulatedTime)}</span>
        </span>
        <span class="sim-info-badge">Simulation Mode</span>
      </div>
      
      <!-- Time Presets -->
      <div class="sim-controls">
        <span style="font-size: 0.75rem; color: #94A3B8; margin-right: 4px;">Jump to:</span>
        <button class="sim-btn time-jump-btn" data-time="495">8:15 AM (Morning)</button>
        <button class="sim-btn time-jump-btn" data-time="511">8:31 AM (Late Mon)</button>
        <button class="sim-btn time-jump-btn" data-time="655">10:55 AM (Pre-Class)</button>
        <button class="sim-btn time-jump-btn" data-time="955">3:55 PM (Evening Check)</button>
        <button class="sim-btn time-jump-btn" data-time="961">4:01 PM (Late Eve)</button>
      </div>

      <!-- Playback Controls -->
      <div class="sim-controls">
        <button class="sim-btn ${!db.isTimeRunning ? 'active' : ''}" id="btn-sim-pause">Pause</button>
        <button class="sim-btn ${db.isTimeRunning && db.timeSpeed === 1 ? 'active' : ''}" id="btn-sim-1x" data-speed="1">1 min/s</button>
        <button class="sim-btn ${db.isTimeRunning && db.timeSpeed === 10 ? 'active' : ''}" id="btn-sim-10x" data-speed="10">10 min/s</button>
        <button class="sim-btn ${db.isTimeRunning && db.timeSpeed === 60 ? 'active' : ''}" id="btn-sim-60x" data-speed="60">1 hr/s</button>
      </div>

      <!-- Operations Guide -->
      <div class="sim-controls">
        <button class="sim-btn" id="btn-show-guide" style="background:var(--accent); color:var(--text-light); font-weight:600; border: 1px solid var(--accent);">Operations Guide</button>
      </div>
    </div>
  `;
  
  // Attach event handlers
  const jumpButtons = container.querySelectorAll('.time-jump-btn');
  jumpButtons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const targetTime = parseInt((e.currentTarget as HTMLButtonElement).dataset.time || '480');
      const currentDb = getDb();
      currentDb.simulatedTime = targetTime;
      saveDb(currentDb);
      
      // Flash chime and trigger render
      playWarningChime();
      window.dispatchEvent(new CustomEvent('sim-tick', { detail: { time: targetTime } }));
      renderSimulatorBar();
    });
  });
  
  container.querySelector('#btn-sim-pause')?.addEventListener('click', () => {
    const currentDb = getDb();
    currentDb.isTimeRunning = false;
    saveDb(currentDb);
    stopClockInterval();
    renderSimulatorBar();
  });
  
  const speedButtons = ['#btn-sim-1x', '#btn-sim-10x', '#btn-sim-60x'];
  speedButtons.forEach((id) => {
    container.querySelector(id)?.addEventListener('click', (e) => {
      const speed = parseInt((e.currentTarget as HTMLButtonElement).dataset.speed || '1');
      const currentDb = getDb();
      currentDb.isTimeRunning = true;
      currentDb.timeSpeed = speed;
      saveDb(currentDb);
      
      startClockInterval(speed);
      renderSimulatorBar();
    });
  });

  // Bind operations guide button
  container.querySelector('#btn-show-guide')?.addEventListener('click', () => {
    showOperationsGuide();
  });
}

function showOperationsGuide(): void {
  if (document.getElementById('sim-guide-modal')) return;

  const modal = document.createElement('div');
  modal.id = 'sim-guide-modal';
  modal.className = 'modal-overlay';
  modal.style.zIndex = '99999';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 700px; max-height: 85vh; overflow-y: auto;">
      <div class="modal-header" style="border-bottom: 1px solid var(--border); padding-bottom: 12px; margin-bottom: 16px;">
        <h3 style="margin:0; font-size:1.3rem; display:flex; align-items:center; gap:8px; color:var(--text);">
          🎓 St. Charles Academy — Operations & Workflow Guide
        </h3>
        <button class="modal-close-btn" id="close-guide-modal" style="font-size:1.5rem; background:none; border:none; cursor:pointer;">×</button>
      </div>
      <div class="modal-body" style="display:flex; flex-direction:column; gap:20px; color:#E2E8F0; line-height:1.6; font-size:0.9rem;">
        
        <section style="background: rgba(30, 41, 59, 0.5); padding: 16px; border-radius: 12px; border: 1px solid var(--border);">
          <h4 style="margin: 0 0 8px 0; color: var(--accent); font-size: 1rem;">🕒 1. Virtual Clock & Timeline Presets</h4>
          <p style="margin: 0;">
            The simulator features a virtual day cycle running continuously. You can use the buttons to <strong>Jump to</strong> different times to simulate school activities:
          </p>
          <ul style="margin: 8px 0 0 0; padding-left: 20px;">
            <li><strong>8:15 AM</strong>: Roll call period. Teachers should submit their Morning Register.</li>
            <li><strong>8:31 AM</strong>: Late morning check. Fired warnings for overdue teacher registers.</li>
            <li><strong>3:55 PM / 4:01 PM</strong>: Evening register submission window and checkouts.</li>
          </ul>
        </section>

        <section style="background: rgba(30, 41, 59, 0.5); padding: 16px; border-radius: 12px; border: 1px solid var(--border);">
          <h4 style="margin: 0 0 8px 0; color: var(--accent); font-size: 1rem;">📝 2. Teacher Registers & Attendance Alerts</h4>
          <p style="margin: 0;">
            Every morning (before 8:30 AM) and evening (before 4:00 PM), teachers must submit registers for their assigned class:
          </p>
          <ul style="margin: 8px 0 0 0; padding-left: 20px;">
            <li><strong>Submission</strong>: Log in as a teacher, go to <strong>Attendance Registers</strong>, mark students, and click <strong>Submit Register</strong>.</li>
            <li><strong>Late Penalties</strong>: If the virtual time passes 8:30 AM or 4:00 PM without register submission, warning bells sound, and the teacher is marked <span class="badge badge-danger">LATE</span> in the Admin dashboard tracker.</li>
            <li><strong>Parental Absence Alert</strong>: Marking a student <strong>Absent</strong> automatically triggers a simulated SMS, WhatsApp, and Email notification to their guardian. Check the logs under the Admin's carrier console!</li>
          </ul>
        </section>

        <section style="background: rgba(30, 41, 59, 0.5); padding: 16px; border-radius: 12px; border: 1px solid var(--border);">
          <h4 style="margin: 0 0 8px 0; color: var(--accent); font-size: 1rem;">📅 3. Schedule Alerts & AI Timetable Import</h4>
          <p style="margin: 0;">
            Classes follow the schedule list. The system rings a bell <strong>5 minutes before class starts</strong> to notify students and teachers. Admins can manage this in two ways:
          </p>
          <ul style="margin: 8px 0 0 0; padding-left: 20px;">
            <li><strong>Manual Scheduler</strong>: Admin can manually add schedule periods specifying subjects, rooms, times, and streams.</li>
            <li><strong>AI Parser (Llama 3)</strong>: Click <strong>Bulk Import Timetable (AI)</strong>. You can paste structured timetable text or drag-and-drop a scheduler image. Llama 3 automatically parses times, streams, rooms, and resolves teacher matches.</li>
          </ul>
        </section>

        <section style="background: rgba(30, 41, 59, 0.5); padding: 16px; border-radius: 12px; border: 1px solid var(--border);">
          <h4 style="margin: 0 0 8px 0; color: var(--accent); font-size: 1rem;">📢 4. Parental Broadcaster & Live Gateway Logs</h4>
          <p style="margin: 0;">
            Admins can send high-priority announcements from the dashboard:
          </p>
          <ul style="margin: 8px 0 0 0; padding-left: 20px;">
            <li><strong>Targeting</strong>: Choose target audience: <em>All Grades</em>, a <em>Specific Grade</em>, or a <em>Specific Parent</em>.</li>
            <li><strong>Simulated Carriers</strong>: The system generates live carrier response headers (WhatsApp Meta API, Safaricom SMS AfricasTalking, SendGrid SMTP server dispatches) displaying the exact recipient contacts in the log terminal.</li>
          </ul>
        </section>
        
      </div>
      <div class="modal-footer" style="border-top: 1px solid var(--border); padding-top: 12px; margin-top: 16px; display:flex; justify-content:flex-end;">
        <button class="btn-primary" id="btn-close-guide" style="padding:8px 16px;">Got It!</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector('#close-guide-modal')?.addEventListener('click', close);
  modal.querySelector('#btn-close-guide')?.addEventListener('click', close);
}
