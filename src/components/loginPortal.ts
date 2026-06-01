import { getDb, saveDb } from '../data/mockDb';
import type { SessionUser } from '../data/mockDb';
import { triggerToastNotification } from './simulatorBar';
import { playWarningChime, triggerHapticVibration } from '../lib/audioService';
import { apiClient, setAuthToken } from '../data/apiClient';

let activeLoginTab: 'student' | 'teacher' | 'admin' = 'student';

export function renderLoginPortal(container: HTMLElement): void {
  container.innerHTML = `
    <div class="login-page-container">
      
      <!-- Left side: Editorial Branded Hero & University bulletins -->
      <div class="login-branding-section">
        <div class="login-brand-header">
          <img src="/school_crest_logo.png" class="login-crest-img" alt="St. Charles Crest" style="height: 80px; width: auto; object-fit: contain;">
          <div>
            <h1>ST. CHARLES ACADEMY</h1>
            <p class="academy-motto">Strive for Excellence, Serve Humanity • Thika Kiganjo</p>
          </div>
        </div>
        
        <!-- Campus Banner Image -->
        <div class="hero-image-banner" style="background-image: url('/schol1.jpg'); background-size: cover; background-position: center; height: 220px; border-radius: 4px; margin: 12px 0; border: 1px solid var(--border-dark);"></div>

        <div class="hero-quote-box">
          <p>“Education is the most powerful weapon which you can use to change the world.”</p>
          <cite>— Nelson Mandela</cite>
        </div>

        <!-- Harvard/Stanford Style Bulletins Grid -->
        <div class="university-bulletin-grid">
          <div class="bulletin-card">
            <h4>Academic Calendar & Highlights</h4>
            <ul class="bulletin-list">
              <li>
                <span class="bulletin-date">JUN 05</span>
                <span class="bulletin-text">CBC Grade 7 Science Laboratory Assessments commence.</span>
              </li>
              <li>
                <span class="bulletin-date">JUN 12</span>
                <span class="bulletin-text">Annual Parents-Teacher Association (PTA) General Assembly.</span>
              </li>
              <li>
                <span class="bulletin-date">JUN 18</span>
                <span class="bulletin-text">Pre-Technical Exhibition: Basic Woodworking & Safety.</span>
              </li>
            </ul>
          </div>
          
          <div class="bulletin-card">
            <h4>Global Resources & Gateways</h4>
            <div class="university-links-grid">
              <a href="#" class="univ-link">Canvas LMS</a>
              <a href="#" class="univ-link">Axess Portal</a>
              <a href="#" class="univ-link">Term Schedule</a>
              <a href="#" class="univ-link">Counseling Hub</a>
            </div>
          </div>
        </div>
      </div>

      <!-- Right side: Authenticated Login Card -->
      <div class="login-card-section">
        <div class="login-card" id="login-form-card">
          <div class="login-card-header">
            <h3>Sign In to Digital Campus</h3>
            <p>Access your personalized dashboard, schedules, and registers.</p>
          </div>

          <!-- Tab Selectors -->
          <div class="login-tabs">
            <button class="login-tab-btn ${activeLoginTab === 'student' ? 'active' : ''}" data-tab="student">Student</button>
            <button class="login-tab-btn ${activeLoginTab === 'teacher' ? 'active' : ''}" data-tab="teacher">Teacher</button>
            <button class="login-tab-btn ${activeLoginTab === 'admin' ? 'active' : ''}" data-tab="admin">Admin</button>
          </div>

          <!-- Login Form Form -->
          <form id="campus-login-form" style="display:flex; flex-direction:column; gap:16px; margin-top:20px;">
            ${renderLoginFormFields()}
            
            <button type="submit" class="btn-primary" style="justify-content:center; padding:12px; font-weight:600; font-size:0.95rem; border-radius:8px;">
              Verify Credentials & Sign In
            </button>
          </form>

          <!-- Help guidelines for tester -->
          <div class="login-demo-helper">
            <strong>Quick-Access Demo Credentials:</strong>
            <ul>
              ${activeLoginTab === 'student' ? '<li>Student ID: <code>S001</code> | Password: <code>student123</code></li>' : ''}
              ${activeLoginTab === 'teacher' ? '<li>Teacher Email: <code>agnes.w@stcharles.sc.ke</code> | Password: <code>teacher123</code></li>' : ''}
              ${activeLoginTab === 'admin' ? '<li>Admin Username: <code>admin</code> | Password: <code>admin123</code></li>' : ''}
            </ul>
          </div>
        </div>
      </div>

    </div>
  `;

  // Bind Event Listeners
  bindLoginEvents(container);
}

function renderLoginFormFields(): string {
  if (activeLoginTab === 'student') {
    return `
      <div class="form-group">
        <label for="login-student-id">Student ID Reference</label>
        <input type="text" id="login-student-id" class="form-control" placeholder="e.g. S001" required autocomplete="username">
      </div>
      <div class="form-group">
        <label for="login-password">Security Password</label>
        <input type="password" id="login-password" class="form-control" placeholder="••••••••" required autocomplete="current-password">
      </div>
    `;
  } else if (activeLoginTab === 'teacher') {
    return `
      <div class="form-group">
        <label for="login-teacher-email">Staff Email Address</label>
        <input type="email" id="login-teacher-email" class="form-control" placeholder="e.g. agnes.w@stcharles.sc.ke" required autocomplete="username">
      </div>
      <div class="form-group">
        <label for="login-password">Security Password</label>
        <input type="password" id="login-password" class="form-control" placeholder="••••••••" required autocomplete="current-password">
      </div>
    `;
  } else {
    return `
      <div class="form-group">
        <label for="login-admin-user">Administrator Username</label>
        <input type="text" id="login-admin-user" class="form-control" placeholder="e.g. admin" required autocomplete="username">
      </div>
      <div class="form-group">
        <label for="login-password">Security Password</label>
        <input type="password" id="login-password" class="form-control" placeholder="••••••••" required autocomplete="current-password">
      </div>
    `;
  }
}

function bindLoginEvents(container: HTMLElement): void {
  // Tab Switch Action
  const tabs = container.querySelectorAll('.login-tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const selectedTab = (e.currentTarget as HTMLButtonElement).dataset.tab as 'student' | 'teacher' | 'admin';
      if (selectedTab) {
        activeLoginTab = selectedTab;
        renderLoginPortal(container);
      }
    });
  });

  // Form Submit Submission
  const form = container.querySelector('#campus-login-form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const passwordEl = container.querySelector('#login-password') as HTMLInputElement;
    const passwordVal = passwordEl?.value;
    
    let payload: any = { role: activeLoginTab, password: passwordVal };

    if (activeLoginTab === 'student') {
      const idEl = container.querySelector('#login-student-id') as HTMLInputElement;
      payload.studentId = idEl?.value.trim().toUpperCase();
    } else if (activeLoginTab === 'teacher') {
      const emailEl = container.querySelector('#login-teacher-email') as HTMLInputElement;
      payload.email = emailEl?.value.trim().toLowerCase();
    } else {
      const adminEl = container.querySelector('#login-admin-user') as HTMLInputElement;
      payload.username = adminEl?.value.trim().toLowerCase();
    }

    try {
      // POST request to actual express login endpoint
      const response = await apiClient.post<{ token: string, user: SessionUser }>('/auth/login', payload);
      
      // Store JWT token dynamically in apiClient/localStorage
      setAuthToken(response.token);
      
      // Sync MockDb fallback state structure for backward compatibility
      const db = getDb();
      db.currentUser = response.user;
      db.activeRole = response.user.role;
      if (response.user.role === 'teacher') db.activeTeacherId = response.user.id;
      if (response.user.role === 'student') db.activeStudentId = response.user.id;
      saveDb(db);
      
      triggerToastNotification(
        'Access Granted',
        `Welcome back, ${response.user.name}! Session established.`
      );
      
      // Dispatch custom authentication change event to trigger complete shell re-render
      window.dispatchEvent(new CustomEvent('auth-changed'));
    } catch (err: any) {
      // Access Denied: Trigger Shake & warn chimes
      const card = container.querySelector('#login-form-card') as HTMLElement;
      if (card) {
        card.classList.remove('shake-animate');
        // Force reflow
        void card.offsetWidth;
        card.classList.add('shake-animate');
      }
      
      playWarningChime();
      triggerHapticVibration([100, 50, 100]);
      triggerToastNotification(
        'Authentication Failed',
        err.message || 'Invalid login reference or security password.',
        'danger'
      );
    }
  });
}
