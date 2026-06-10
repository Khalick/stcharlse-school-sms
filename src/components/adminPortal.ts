import { renderDashboardTab } from './admin/dashboardTab';
import { renderStudentsTab } from './admin/studentsTab';
import { renderTeachersTab } from './admin/teachersTab';
import { renderMaterialsTab } from './admin/materialsTab';
import { renderTimetableTab } from './admin/timetableTab';
import { renderRegistersTab } from './admin/registersTab';
import { renderBoardTab } from './admin/boardTab';

type AdminTab = 'dashboard' | 'students' | 'teachers' | 'materials' | 'timetable' | 'registers' | 'board';
let activeAdminTab: AdminTab = 'dashboard';

export async function renderAdminPortal(container: HTMLElement): Promise<void> {
  // 1. Build the wrapper template with the tab bar and the content viewport
  container.innerHTML = `
    <!-- Workspace Tab Selector -->
    <div class="admin-tabs">
      <button class="admin-tab-btn ${activeAdminTab === 'dashboard' ? 'active' : ''}" data-tab="dashboard">Dashboard Overview</button>
      <button class="admin-tab-btn ${activeAdminTab === 'students' ? 'active' : ''}" data-tab="students">Students Directory</button>
      <button class="admin-tab-btn ${activeAdminTab === 'teachers' ? 'active' : ''}" data-tab="teachers">Teacher Staff</button>
      <button class="admin-tab-btn ${activeAdminTab === 'materials' ? 'active' : ''}" data-tab="materials">Materials Vault</button>
      <button class="admin-tab-btn ${activeAdminTab === 'timetable' ? 'active' : ''}" data-tab="timetable">Class Timetables</button>
      <button class="admin-tab-btn ${activeAdminTab === 'registers' ? 'active' : ''}" data-tab="registers">Class Registers</button>
      <button class="admin-tab-btn ${activeAdminTab === 'board' ? 'active' : ''}" data-tab="board">School Board</button>
    </div>

    <!-- Active Tab Panel Viewport -->
    <div id="admin-active-tab-panel">
      <div style="padding:40px; text-align:center; color:var(--text-light)">Loading workspace dataset...</div>
    </div>
  `;

  // 2. Query tab panel element
  const tabPanel = container.querySelector('#admin-active-tab-panel') as HTMLElement;

  // 3. Bind tab button listeners
  container.querySelectorAll('.admin-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetTab = (e.currentTarget as HTMLElement).dataset.tab as AdminTab;
      if (targetTab && targetTab !== activeAdminTab) {
        activeAdminTab = targetTab;
        renderAdminPortal(container);
      }
    });
  });

  // 4. Render the active tab view inside the viewport panel
  try {
    if (activeAdminTab === 'dashboard') {
      await renderDashboardTab(tabPanel);
    } else if (activeAdminTab === 'students') {
      await renderStudentsTab(tabPanel);
    } else if (activeAdminTab === 'teachers') {
      await renderTeachersTab(tabPanel);
    } else if (activeAdminTab === 'materials') {
      await renderMaterialsTab(tabPanel);
    } else if (activeAdminTab === 'timetable') {
      await renderTimetableTab(tabPanel);
    } else if (activeAdminTab === 'registers') {
      await renderRegistersTab(tabPanel);
    } else if (activeAdminTab === 'board') {
      await renderBoardTab(tabPanel);
    }
  } catch (err: any) {
    console.error(`Error rendering active admin tab (${activeAdminTab}):`, err);
    tabPanel.innerHTML = `
      <div style="padding: 24px; text-align:center;">
        <h3 style="color: var(--crimson);">Workspace View Synchronization Error</h3>
        <p style="color: var(--text-light); margin-top: 8px;">Failed to query server for active workspace view: ${err.message}</p>
        <button class="btn-primary" id="btn-tab-retry" style="margin-top: 16px; margin-inline: auto;">Retry Connection</button>
      </div>
    `;
    tabPanel.querySelector('#btn-tab-retry')?.addEventListener('click', () => {
      renderAdminPortal(container);
    });
  }
}
