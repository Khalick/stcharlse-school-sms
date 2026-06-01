import './style.css';
import { getDb, saveDb } from './data/mockDb';
import { initSimulator, renderSimulatorBar } from './components/simulatorBar';
import { renderAdminPortal } from './components/adminPortal';
import { renderTeacherPortal } from './components/teacherPortal';
import { renderStudentPortal } from './components/studentPortal';
import { renderLoginPortal } from './components/loginPortal';
import { clearAuthToken } from './data/apiClient';

// Main App Controller
document.addEventListener('DOMContentLoaded', () => {
  // Register Service Worker for Simulated Push Notifications
  registerServiceWorker();

  // Initialize clock and simulator
  initSimulator();

  // Initial Router Check
  route();

  // Listen to Authentication State changes
  window.addEventListener('auth-changed', () => {
    route();
  });

  // Global event listener for Clock tick-tick updates
  // Throttle to avoid spamming API calls — only update the simulator bar clock display
  window.addEventListener('sim-tick', () => {
    const db = getDb();
    // Only update the clock text display, not the full portal
    const clockEl = document.getElementById('sim-clock-text');
    if (clockEl) {
      const hrs = Math.floor(db.simulatedTime / 60) % 24;
      const mins = db.simulatedTime % 60;
      const ampm = hrs >= 12 ? 'PM' : 'AM';
      const displayHrs = hrs === 0 ? 12 : hrs > 12 ? hrs - 12 : hrs;
      clockEl.textContent = `${displayHrs < 10 ? '0' + displayHrs : displayHrs}:${mins < 10 ? '0' + mins : mins} ${ampm}`;
    }
  });
});

/**
 * Validates active session and routes user to their workspace or the landing login portal.
 */
function route(): void {
  const db = getDb();
  const contentWrapper = document.getElementById('portal-content');
  const simulatorBar = document.getElementById('simulator-bar');
  const authHeaderActions = document.getElementById('auth-header-actions');

  if (!contentWrapper) return;

  if (db.currentUser) {
    // Show simulator bar for authenticated simulation tracking
    if (simulatorBar) {
      simulatorBar.style.display = 'block';
      renderSimulatorBar();
    }

    // Render Authenticated user actions in Header
    if (authHeaderActions) {
      authHeaderActions.innerHTML = `
        <div class="user-badge">
          <span class="user-avatar-dot"></span>
          <span class="user-name-text">${db.currentUser.name} <span class="role-sub-badge">${db.currentUser.role.toUpperCase()}</span></span>
        </div>
        <button class="btn-signout" id="btn-signout-trigger">Sign Out</button>
      `;

      // Bind Sign Out trigger
      document.getElementById('btn-signout-trigger')?.addEventListener('click', () => {
        const currentDb = getDb();
        currentDb.currentUser = null;
        saveDb(currentDb);
        
        // Clear JWT token from localStorage
        clearAuthToken();
        
        // Dispatch event
        window.dispatchEvent(new CustomEvent('auth-changed'));
      });
    }

    // Render Portal view matching authenticated user's role
    renderActivePortal(db.currentUser.role);
  } else {
    // Hide simulator bar for unauthenticated guests
    if (simulatorBar) {
      simulatorBar.style.display = 'none';
    }

    // Clear Header badge actions
    if (authHeaderActions) {
      authHeaderActions.innerHTML = '';
    }

    // Render login landing card
    renderLoginPortal(contentWrapper);
  }
}

/**
 * Builds and renders the active portal component inside container.
 * All portal renders are async since they fetch from the real backend.
 */
function renderActivePortal(role: 'admin' | 'teacher' | 'student'): void {
  const contentWrapper = document.getElementById('portal-content');
  if (!contentWrapper) return;

  if (role === 'admin') {
    renderAdminPortal(contentWrapper);
  } else if (role === 'teacher') {
    renderTeacherPortal(contentWrapper);
  } else if (role === 'student') {
    renderStudentPortal(contentWrapper);
  }
}

/**
 * Service Worker Helper for Push alerts.
 */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => {
          console.log('St. Charles SMS Service Worker registered successfully: ', reg.scope);
        })
        .catch((err) => {
          console.error('Service worker registration failed: ', err);
        });
    });
  }
}
