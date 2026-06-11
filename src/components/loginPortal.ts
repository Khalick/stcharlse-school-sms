import { getDb, saveDb } from '../data/mockDb';
import type { SessionUser } from '../data/mockDb';
import { triggerToastNotification } from './simulatorBar';
import { playWarningChime, triggerHapticVibration } from '../lib/audioService';
import { apiClient, setAuthToken } from '../data/apiClient';
import { SCHOOL_STREAMS } from '../lib/constants';

let activeLoginTab: 'student' | 'teacher' | 'admin' = 'student';
let isTeacherRegistering = false;

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
          ${isTeacherRegistering ? renderTeacherRegistrationForm() : renderLoginForm()}
        </div>
      </div>

    </div>
  `;

  // Bind Event Listeners
  bindLoginEvents(container);
}

function renderLoginForm(): string {
  return `
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

    ${activeLoginTab === 'teacher' ? `
      <div style="text-align:center; margin-top:12px;">
        <a href="#" id="link-register-teacher" style="color:var(--primary); font-size:0.85rem; font-weight:600; text-decoration:none;">Register Staff Account</a>
      </div>
    ` : ''}


  `;
}

function renderTeacherRegistrationForm(): string {
  return `
    <div class="login-card-header">
      <h3>Register Teacher Account</h3>
      <p>Submit your details to register as a staff member. Access is granted upon administrator approval.</p>
    </div>
    
    <form id="teacher-register-form" style="display:flex; flex-direction:column; gap:16px; margin-top:20px;">
      <div class="form-group">
        <label for="reg-name">Full Name</label>
        <input type="text" id="reg-name" class="form-control" placeholder="e.g. Agnes Wambui" required>
      </div>
      <div class="form-group">
        <label for="reg-email">Email Address</label>
        <input type="email" id="reg-email" class="form-control" placeholder="e.g. agnes.w@stcharles.sc.ke" required>
      </div>
      <div class="form-group">
        <label for="reg-phone">Mobile Phone</label>
        <input type="text" id="reg-phone" class="form-control" placeholder="e.g. +254 721 111222">
      </div>
      <div class="form-group">
        <label for="reg-stream">Primary Class Stream Assignment</label>
        <select id="reg-stream" class="form-control" required style="font-family: inherit;">
          <option value="">-- Select Grade Level --</option>
          ${SCHOOL_STREAMS.map(g => `<option value="${g}">${g}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Kenyan CBC Subject Specialization(s)</label>
        <div id="reg-subjects-container" style="display:flex; flex-wrap:wrap; gap:8px; padding:12px; border:1px solid var(--border); border-radius:4px; background:var(--bg-light);">
          <span style="color:var(--text-light); font-size:0.85rem;">Select a class stream above to load the official CBC subjects.</span>
        </div>
      </div>
      <div class="form-group">
        <label for="reg-password">Choose Password</label>
        <input type="password" id="reg-password" class="form-control" placeholder="••••••••" required>
      </div>
      
      <button type="submit" class="btn-primary" style="justify-content:center; padding:12px; font-weight:600; font-size:0.95rem; border-radius:8px;">
        Submit Registration Request
      </button>

      <div style="text-align:center; margin-top:10px;">
        <a href="#" id="link-back-to-login" style="color:var(--primary); font-size:0.85rem; font-weight:600; text-decoration:none;">← Back to Sign In</a>
      </div>
    </form>
  `;
}

function renderLoginFormFields(): string {
  if (activeLoginTab === 'student') {
    return `
      <div class="form-group">
        <label for="login-student-id">Student Username (First Name or Admission Number)</label>
        <input type="text" id="login-student-id" class="form-control" placeholder="e.g. David" required autocomplete="username">
      </div>
      <div class="form-group">
        <label for="login-password">Password (Admission Number)</label>
        <input type="password" id="login-password" class="form-control" placeholder="e.g. S001" required autocomplete="current-password">
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
        <input type="text" id="login-admin-user" class="form-control" placeholder="Enter admin username" required autocomplete="username">
      </div>
      <div class="form-group">
        <label for="login-password">Security Password</label>
        <input type="password" id="login-password" class="form-control" placeholder="••••••••" required autocomplete="current-password">
      </div>
    `;
  }
}

function bindLoginEvents(container: HTMLElement): void {
  if (isTeacherRegistering) {
    // Back to Login Link
    container.querySelector('#link-back-to-login')?.addEventListener('click', (e) => {
      e.preventDefault();
      isTeacherRegistering = false;
      renderLoginPortal(container);
    });

    // Dynamic CBC Subjects Loading
    const streamSelect = container.querySelector('#reg-stream') as HTMLSelectElement;
    const subjectsContainer = container.querySelector('#reg-subjects-container') as HTMLElement;

    streamSelect?.addEventListener('change', () => {
      const val = streamSelect.value;
      let subjects: string[] = [];
      if (val.includes('Play Group') || val.includes('PP1') || val.includes('PP2') || val.includes('Grade 1') || val.includes('Grade 2') || val.includes('Grade 3')) {
        subjects = ['Mathematics Activities', 'English Language Activities', 'Kiswahili Language Activities', 'Environmental Activities', 'Hygiene and Nutrition Activities', 'CRE / IRE / HRE', 'Movement and Creative Activities'];
      } else if (val === 'Grade 4' || val === 'Grade 5' || val === 'Grade 6') {
        subjects = ['Mathematics', 'English', 'Kiswahili', 'Science and Technology', 'Agriculture', 'Home Science', 'Creative Arts', 'Physical and Health Education', 'CRE / IRE / HRE', 'Social Studies'];
      } else if (val.startsWith('Grade 7') || val === 'Grade 8' || val === 'Grade 9') {
        subjects = ['English', 'Kiswahili', 'Mathematics', 'Integrated Science', 'Health Education', 'Pre-Technical and Pre-Career Education', 'Social Studies', 'Religious Education', 'Business Studies', 'Agriculture', 'Life Skills Education', 'Sports and Physical Education'];
      }
      
      if (subjects.length > 0) {
        subjectsContainer.innerHTML = subjects.map(sub => `
          <label style="display:flex; align-items:center; gap:6px; font-size:0.85rem; font-weight:normal; width:calc(50% - 4px); cursor:pointer;">
            <input type="checkbox" class="cbc-subject-cb" value="${sub}">
            ${sub}
          </label>
        `).join('');
      } else {
        subjectsContainer.innerHTML = '<span style="color:var(--text-light); font-size:0.85rem;">Select a class stream above to load the official CBC subjects.</span>';
      }
    });

    // Registration Form Submit
    container.querySelector('#teacher-register-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();

      const selectedSubjects = Array.from(container.querySelectorAll('.cbc-subject-cb:checked')).map((cb: any) => cb.value);
      if (selectedSubjects.length === 0) {
        triggerToastNotification('Missing Subjects', 'Please select at least one teaching subject from the syllabus.', 'warning');
        return;
      }

      const payload = {
        name: (container.querySelector('#reg-name') as HTMLInputElement).value.trim(),
        email: (container.querySelector('#reg-email') as HTMLInputElement).value.trim(),
        phone: (container.querySelector('#reg-phone') as HTMLInputElement).value.trim(),
        subjects: selectedSubjects,
        stream: streamSelect.value,
        password: (container.querySelector('#reg-password') as HTMLInputElement).value
      };

      try {
        await apiClient.post('/auth/register-teacher', payload);
        triggerToastNotification(
          'Registration Submitted',
          'Your teacher profile has been registered. Please wait for administrator approval.'
        );
        isTeacherRegistering = false;
        renderLoginPortal(container);
      } catch (err: any) {
        triggerToastNotification('Registration Failed', err.message, 'danger');
      }
    });

    return;
  }

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

  // Link to Register Teacher
  container.querySelector('#link-register-teacher')?.addEventListener('click', (e) => {
    e.preventDefault();
    isTeacherRegistering = true;
    renderLoginPortal(container);
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
      payload.studentId = idEl?.value.trim();
    } else if (activeLoginTab === 'teacher') {
      const emailEl = container.querySelector('#login-teacher-email') as HTMLInputElement;
      payload.email = emailEl?.value.trim().toLowerCase();
    } else {
      const adminEl = container.querySelector('#login-admin-user') as HTMLInputElement;
      payload.username = adminEl?.value.trim();
    }

    try {
      // POST request to express login endpoint
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
