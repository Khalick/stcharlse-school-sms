import { apiClient } from '../../data/apiClient';
import { SCHOOL_STREAMS } from '../../lib/constants';

let selectedStream = 'Grade 6 East';
let currentWeekStart = getMonday(new Date());

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

export async function renderRegistersTab(container: HTMLElement): Promise<void> {
  const weekStartStr = formatDateStr(currentWeekStart);

  let data: { dates: string[]; grid: any[] } = { dates: [], grid: [] };
  let fetchError = '';

  try {
    data = await apiClient.get<{ dates: string[]; grid: any[] }>(
      `/attendance/weekly-grid?stream=${encodeURIComponent(selectedStream)}&weekStart=${weekStartStr}`
    );
  } catch (err: any) {
    fetchError = err.message;
  }

  // Calculate Friday date for display
  const fridayDate = new Date(currentWeekStart);
  fridayDate.setDate(currentWeekStart.getDate() + 4);
  const dateHeading = `Week of ${formatDisplayDate(weekStartStr)} — ${formatDisplayDate(formatDateStr(fridayDate))}`;

  const streams = SCHOOL_STREAMS;

  container.innerHTML = `
    <div class="card-header-with-action" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom: 20px;">
      <h2 class="card-title">Kenyan School Register Book</h2>
      <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
        <!-- Stream Selector -->
        <select id="reg-stream-select" class="form-control" style="width: 160px; font-family: inherit;">
          ${streams.map(s => `<option value="${s}" ${selectedStream === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        
        <!-- Week Navigation -->
        <div style="display:flex; gap:4px; align-items:center;">
          <button class="btn-action" id="btn-prev-week" style="padding: 6px 12px;">◀ Prev Week</button>
          <span style="font-weight: 600; padding: 0 8px; font-size:0.9rem; color:var(--text);">${dateHeading}</span>
          <button class="btn-action" id="btn-next-week" style="padding: 6px 12px;">Next Week ▶</button>
        </div>
      </div>
    </div>

    ${fetchError ? `
      <div style="padding:24px; text-align:center; color:var(--crimson)">
        Failed to load register book data: ${fetchError}
      </div>
    ` : `
      <div class="table-wrapper">
        <table class="premium-table register-grid-table">
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
              <th style="text-align: center; font-size: 0.75rem; color: var(--text-light); width: 45px;">M</th>
              <th style="text-align: center; font-size: 0.75rem; color: var(--text-light); width: 45px;">A</th>
              <th style="text-align: center; font-size: 0.75rem; color: var(--text-light); width: 45px;">M</th>
              <th style="text-align: center; font-size: 0.75rem; color: var(--text-light); width: 45px;">A</th>
              <th style="text-align: center; font-size: 0.75rem; color: var(--text-light); width: 45px;">M</th>
              <th style="text-align: center; font-size: 0.75rem; color: var(--text-light); width: 45px;">A</th>
              <th style="text-align: center; font-size: 0.75rem; color: var(--text-light); width: 45px;">M</th>
              <th style="text-align: center; font-size: 0.75rem; color: var(--text-light); width: 45px;">A</th>
              <th style="text-align: center; font-size: 0.75rem; color: var(--text-light); width: 45px;">M</th>
              <th style="text-align: center; font-size: 0.75rem; color: var(--text-light); width: 45px;">A</th>
              <th style="text-align: center; font-size: 0.75rem; font-weight: 600; color: var(--green); border-left: 2px solid var(--border); width: 45px;">P</th>
              <th style="text-align: center; font-size: 0.75rem; font-weight: 600; color: var(--crimson); width: 45px;">A</th>
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
                  return `<span style="color: var(--green); font-weight: bold; font-size: 1.1rem;">✓</span>`;
                } else if (status === 'absent') {
                  absentCount++;
                  return `<span style="color: var(--crimson); font-weight: bold; font-size: 0.9rem;">A</span>`;
                }
                return `<span style="color: var(--text-light); opacity: 0.4;">-</span>`;
              };

              return `
                <tr>
                  <td style="text-align: left; font-weight: 500;">
                    <strong>${row.name}</strong><br>
                    <span style="font-size:0.75rem; color:var(--text-light)">ID: ${row.id}</span>
                  </td>
                  <!-- Monday -->
                  <td style="text-align: center;">${renderCell(data.dates[0], 'morning')}</td>
                  <td style="text-align: center;">${renderCell(data.dates[0], 'evening')}</td>
                  <!-- Tuesday -->
                  <td style="text-align: center;">${renderCell(data.dates[1], 'morning')}</td>
                  <td style="text-align: center;">${renderCell(data.dates[1], 'evening')}</td>
                  <!-- Wednesday -->
                  <td style="text-align: center;">${renderCell(data.dates[2], 'morning')}</td>
                  <td style="text-align: center;">${renderCell(data.dates[2], 'evening')}</td>
                  <!-- Thursday -->
                  <td style="text-align: center;">${renderCell(data.dates[3], 'morning')}</td>
                  <td style="text-align: center;">${renderCell(data.dates[3], 'evening')}</td>
                  <!-- Friday -->
                  <td style="text-align: center;">${renderCell(data.dates[4], 'morning')}</td>
                  <td style="text-align: center;">${renderCell(data.dates[4], 'evening')}</td>
                  <!-- Totals -->
                  <td style="text-align: center; border-left: 2px solid var(--border); font-weight: 700; color: var(--green); background: rgba(16,185,129,0.05);">${presentCount}</td>
                  <td style="text-align: center; font-weight: 700; color: var(--crimson); background: rgba(239,68,68,0.05);">${absentCount}</td>
                </tr>
              `;
            }).join('')}
            ${data.grid.length === 0 ? `
              <tr>
                <td colspan="13" style="text-align:center; padding: 24px; color:var(--text-light)">
                  No students registered under ${selectedStream} stream.
                </td>
              </tr>
            ` : ''}
          </tbody>
        </table>
      </div>
    `}
  `;

  // Bind change handlers
  container.querySelector('#reg-stream-select')?.addEventListener('change', (e) => {
    selectedStream = (e.currentTarget as HTMLSelectElement).value;
    renderRegistersTab(container);
  });

  container.querySelector('#btn-prev-week')?.addEventListener('click', () => {
    currentWeekStart.setDate(currentWeekStart.getDate() - 7);
    renderRegistersTab(container);
  });

  container.querySelector('#btn-next-week')?.addEventListener('click', () => {
    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    renderRegistersTab(container);
  });
}
