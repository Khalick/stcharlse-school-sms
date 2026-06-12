import { apiClient } from '../../data/apiClient';
import { triggerToastNotification } from '../simulatorBar';
import { getSubjectsForGrade, SCHOOL_STREAMS } from '../../lib/constants';

// Maps grade number to the streams that belong to it
const GRADE_STREAMS: Record<string, string[]> = {
  'Play Group': SCHOOL_STREAMS.filter(s => s.startsWith('Play Group')),
  'PP1': SCHOOL_STREAMS.filter(s => s.startsWith('PP1')),
  'PP2': SCHOOL_STREAMS.filter(s => s.startsWith('PP2')),
  'Grade 1': SCHOOL_STREAMS.filter(s => s.startsWith('Grade 1 ')),
  'Grade 2': SCHOOL_STREAMS.filter(s => s.startsWith('Grade 2 ')),
  'Grade 3': SCHOOL_STREAMS.filter(s => s.startsWith('Grade 3 ')),
  'Grade 4': SCHOOL_STREAMS.filter(s => s.startsWith('Grade 4 ')),
  'Grade 5': SCHOOL_STREAMS.filter(s => s.startsWith('Grade 5 ')),
  'Grade 6': SCHOOL_STREAMS.filter(s => s.startsWith('Grade 6 ')),
  'Grade 7': SCHOOL_STREAMS.filter(s => s.startsWith('Grade 7 ')),
  'Grade 8': SCHOOL_STREAMS.filter(s => s.startsWith('Grade 8 ')),
  'Grade 9': SCHOOL_STREAMS.filter(s => s.startsWith('Grade 9 ')),
};

const ALL_GRADES = Object.keys(GRADE_STREAMS);

export async function renderResultsTab(container: HTMLElement): Promise<void> {
  container.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--text-light);">Loading Results Studio...</div>`;

  const term = 'Term 1';
  const year = 2026;
  const examType = 'End Term';

  try {
    container.innerHTML = `
      <div class="dashboard-grid">

        <!-- MODULE 1: Cross-Marking Assignment Engine -->
        <section class="card col-12 relative-card" style="margin-bottom: 24px;">
          <h2 class="card-title">Cross-Marking Assignment Engine</h2>
          <p style="color:var(--text-light); font-size:0.85rem; margin-bottom:16px;">
            Assign qualified teachers to mark specific class streams. The <strong>Anti-Bias Rule</strong> automatically prevents teachers from marking their own stream.
          </p>

          <div style="background:var(--surface); border:1px solid var(--border); padding:20px; border-radius:8px; display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap;">
            <div class="form-group" style="flex:1; min-width:130px; margin:0;">
              <label for="assign-grade" style="font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-light);">Grade</label>
              <select id="assign-grade" class="form-control" style="margin-top:4px;">
                <option value="">Select Grade...</option>
                ${ALL_GRADES.map(g => `<option value="${g}">${g}</option>`).join('')}
              </select>
            </div>
            <div class="form-group" style="flex:1; min-width:150px; margin:0;">
              <label for="assign-stream" style="font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-light);">Stream</label>
              <select id="assign-stream" class="form-control" style="margin-top:4px;" disabled>
                <option value="">Select Stream...</option>
              </select>
            </div>
            <div class="form-group" style="flex:1; min-width:180px; margin:0;">
              <label for="assign-subject" style="font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-light);">Subject</label>
              <select id="assign-subject" class="form-control" style="margin-top:4px;" disabled>
                <option value="">Select Subject...</option>
              </select>
            </div>
            <div class="form-group" style="flex:2; min-width:200px; margin:0;">
              <label for="assign-teacher" style="font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-light);">Eligible Marker</label>
              <select id="assign-teacher" class="form-control" style="margin-top:4px;" disabled>
                <option value="">Waiting for criteria...</option>
              </select>
            </div>
            <button id="btn-create-assignment" class="btn-primary" style="height: 42px; white-space:nowrap; min-width:130px;" disabled>Assign Marker</button>
          </div>

          <!-- Active Assignments Table -->
          <div id="active-assignments-list" style="margin-top: 20px;">
            <p style="font-size:0.85rem; color:var(--text-light);">Loading active assignments...</p>
          </div>
        </section>

        <!-- MODULE 2: School Broadsheet -->
        <section class="card col-12 relative-card">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; flex-wrap:wrap; gap:12px;">
            <div>
              <h2 class="card-title" style="margin-bottom:4px;">School Broadsheet</h2>
              <p style="color:var(--text-light); font-size:0.85rem; margin:0;">Official merit list — ranked academic performance.</p>
            </div>
            <div style="display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap;">
              <div>
                <label style="font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-light); display:block; margin-bottom:3px;">Grade</label>
                <select id="merit-grade-filter" class="form-control" style="width:130px;">
                  ${ALL_GRADES.map(g => `<option value="${g}">${g}</option>`).join('')}
                </select>
              </div>
              <div>
                <label style="font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-light); display:block; margin-bottom:3px;">Stream</label>
                <select id="merit-stream-filter" class="form-control" style="width:160px;">
                  <option value="all">All Streams (Full Grade)</option>
                </select>
              </div>
              <button id="btn-refresh-merit" class="btn-outline" style="height:38px;">↻ Refresh</button>
            </div>
          </div>

          <!-- View Tabs -->
          <div style="display:flex; gap:0; border-bottom:2px solid var(--border); margin-bottom:16px;">
            <button id="tab-stream-merit" style="background:none; border:none; border-bottom:3px solid var(--crimson); padding:8px 20px; font-weight:700; font-size:0.85rem; color:var(--navy); cursor:pointer; margin-bottom:-2px;">Stream Merit List</button>
            <button id="tab-grade-merit" style="background:none; border:none; border-bottom:3px solid transparent; padding:8px 20px; font-weight:700; font-size:0.85rem; color:var(--text-light); cursor:pointer; margin-bottom:-2px;">Full Grade Merit List</button>
          </div>

          <div id="merit-list-container" style="overflow-x:auto;">
            <p style="text-align:center; padding:20px; color:var(--text-light);">Select a grade and stream above, then click Refresh.</p>
          </div>
        </section>
      </div>
    `;

    // ─── ASSIGNMENT ENGINE LOGIC ────────────────────────────────
    const gradeSelect   = document.getElementById('assign-grade')   as HTMLSelectElement;
    const streamSelect  = document.getElementById('assign-stream')  as HTMLSelectElement;
    const subjectSelect = document.getElementById('assign-subject') as HTMLSelectElement;
    const teacherSelect = document.getElementById('assign-teacher') as HTMLSelectElement;
    const assignBtn     = document.getElementById('btn-create-assignment') as HTMLButtonElement;

    gradeSelect.addEventListener('change', () => {
      const g = gradeSelect.value;
      streamSelect.innerHTML = '<option value="">Select Stream...</option>';
      subjectSelect.innerHTML = '<option value="">Select Subject...</option>';
      teacherSelect.innerHTML = '<option value="">Waiting for criteria...</option>';
      streamSelect.disabled = !g;
      subjectSelect.disabled = true;
      teacherSelect.disabled = true;
      assignBtn.disabled = true;

      if (g && GRADE_STREAMS[g]) {
        GRADE_STREAMS[g].forEach(s => {
          streamSelect.innerHTML += `<option value="${s}">${s}</option>`;
        });
      }
    });

    streamSelect.addEventListener('change', () => {
      const streamVal = streamSelect.value;
      subjectSelect.disabled = !streamVal;
      teacherSelect.disabled = true;
      assignBtn.disabled = true;

      if (streamVal) {
        const subjects = getSubjectsForGrade(streamVal);
        subjectSelect.innerHTML = '<option value="">Select Subject...</option>' +
          subjects.map(s => `<option value="${s}">${s}</option>`).join('');
      } else {
        subjectSelect.innerHTML = '<option value="">Select Subject...</option>';
      }
    });

    subjectSelect.addEventListener('change', async () => {
      const stream  = streamSelect.value;
      const subject = subjectSelect.value;
      if (!stream || !subject) { teacherSelect.disabled = true; return; }

      teacherSelect.innerHTML = '<option value="">Checking eligibility...</option>';
      teacherSelect.disabled = true;

      try {
        const teachers = await apiClient.get<any[]>(
          `/admin/grading-eligibility?className=${encodeURIComponent(stream)}&subjectName=${encodeURIComponent(subject)}&term=${term}&year=${year}`
        );
        if (teachers.length === 0) {
          teacherSelect.innerHTML = '<option value="">No eligible teachers found</option>';
        } else {
          teacherSelect.innerHTML = '<option value="">Select Teacher...</option>' +
            teachers.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
          teacherSelect.disabled = false;
        }
      } catch {
        triggerToastNotification('Failed to query eligibility engine.', 'error');
        teacherSelect.innerHTML = '<option value="">Error loading</option>';
      }
    });

    teacherSelect.addEventListener('change', () => {
      assignBtn.disabled = !teacherSelect.value;
    });

    assignBtn.addEventListener('click', async () => {
      const teacherId = teacherSelect.value;
      const stream    = streamSelect.value;
      const subject   = subjectSelect.value;
      try {
        assignBtn.disabled = true;
        assignBtn.textContent = 'Assigning...';
        await apiClient.post('/admin/grading-assignments', { teacherId, className: stream, subjectName: subject, term, year });
        triggerToastNotification('Teacher assigned successfully!', 'success');
        subjectSelect.value = '';
        teacherSelect.innerHTML = '<option value="">Waiting for criteria...</option>';
        teacherSelect.disabled = true;
        assignBtn.textContent = 'Assign Marker';
        loadActiveAssignments();
      } catch (err: any) {
        triggerToastNotification(err.message || 'Failed to assign teacher.', 'error');
        assignBtn.disabled = false;
        assignBtn.textContent = 'Assign Marker';
      }
    });

    // ─── ACTIVE ASSIGNMENTS ─────────────────────────────────────
    const loadActiveAssignments = async () => {
      const c = document.getElementById('active-assignments-list');
      if (!c) return;
      try {
        const assignments = await apiClient.get<any[]>(`/admin/grading-assignments?term=${term}&year=${year}`);
        if (assignments.length === 0) {
          c.innerHTML = `<p style="font-size:0.85rem; color:var(--text-light);">No active assignments for this term.</p>`;
          return;
        }
        c.innerHTML = `
          <h3 style="font-size:0.85rem; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-light); margin-bottom:10px;">Active Assignments — ${term} ${year}</h3>
          <table class="premium-table" style="font-size:0.83rem;">
            <thead>
              <tr>
                <th>Teacher Name</th>
                <th>Class Stream</th>
                <th>Subject</th>
              </tr>
            </thead>
            <tbody>
              ${assignments.map(a => `
                <tr>
                  <td style="font-weight:600;">${a.teacher_name}</td>
                  <td>${a.class_name}</td>
                  <td>${a.subject_name}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      } catch { /* silent */ }
    };

    // ─── BROADSHEET LOGIC ──────────────────────────────────────
    const meritGradeSelect  = document.getElementById('merit-grade-filter')  as HTMLSelectElement;
    const meritStreamSelect = document.getElementById('merit-stream-filter') as HTMLSelectElement;

    let currentBroadsheetData: any[] = [];
    let currentBroadsheetSubjects: string[] = [];
    let isCBCGrade = false;
    // Track current sort mode: 'merit' = by rank, 'class' = alphabetical
    let currentSortMode: 'merit' | 'class' = 'merit';

    // When grade changes, populate stream dropdown
    meritGradeSelect.addEventListener('change', () => {
      const g = meritGradeSelect.value;
      meritStreamSelect.innerHTML = `<option value="all">All Streams (Full Grade)</option>`;
      if (g && GRADE_STREAMS[g]) {
        GRADE_STREAMS[g].forEach(s => {
          meritStreamSelect.innerHTML += `<option value="${s}">${s}</option>`;
        });
      }
    });
    // Populate initial grade 6 streams
    (() => {
      const g = meritGradeSelect.value;
      if (g && GRADE_STREAMS[g]) {
        GRADE_STREAMS[g].forEach(s => {
          meritStreamSelect.innerHTML += `<option value="${s}">${s}</option>`;
        });
      }
    })();

    const renderBroadsheet = (data: any[], subjects: string[], isCBC: boolean) => {
      if (data.length === 0) {
        return `<div style="text-align:center; padding:40px; color:var(--text-light);">No student data found for this selection.</div>`;
      }

      // Subject totals for footer row
      const subjectTotals: Record<string, number> = {};
      const subjectCounts: Record<string, number> = {};
      let grandTotal = 0, grandCount = 0;

      data.forEach(row => {
        subjects.forEach(subj => {
          const d = row.subjects[subj];
          if (d) {
            subjectTotals[subj] = (subjectTotals[subj] || 0) + d.marks;
            subjectCounts[subj] = (subjectCounts[subj] || 0) + 1;
            grandTotal += d.marks;
            grandCount++;
          }
        });
      });
      const classAvg = grandCount > 0 ? (grandTotal / grandCount).toFixed(1) : '0.0';

      // abbreviate subject to 4 chars for header
      const abbrev = (s: string) => s.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 5);

      return `
        <table style="width:100%; border-collapse:collapse; font-size:0.78rem; white-space:nowrap; font-family:'Outfit',sans-serif;">
          <thead>
            <tr style="background:var(--crimson); color:#fff;">
              <th style="border:1px solid #c0392b; padding:7px 6px; text-align:center; width:36px;">No</th>
              <th style="border:1px solid #c0392b; padding:7px 10px; text-align:left; min-width:160px;">NAME</th>
              <th style="border:1px solid #c0392b; padding:7px 8px; text-align:center;">CLASS</th>
              ${subjects.map(s => `<th style="border:1px solid #c0392b; padding:7px 6px; text-align:center;" title="${s}">${abbrev(s)}</th>`).join('')}
              <th style="border:1px solid #c0392b; padding:7px 8px; text-align:center; font-weight:800;">TOTAL</th>
              <th style="border:1px solid #c0392b; padding:7px 8px; text-align:center; font-weight:800;">AVG</th>
              ${isCBC ? `<th style="border:1px solid #c0392b; padding:7px 6px; text-align:center;">POINTS</th>` : ''}
              <th style="border:1px solid #c0392b; padding:7px 8px; text-align:center; font-weight:800;">POSITION</th>
            </tr>
          </thead>
          <tbody>
            ${data.map((row, idx) => {
              const bg = idx < 3 ? '#fffce8' : idx % 2 === 0 ? '#fff' : '#f9f9f9';
              const rankColor = row.rank === 1 ? '#b8860b' : row.rank === 2 ? '#707070' : row.rank === 3 ? '#cd7f32' : 'inherit';
              const rankWeight = row.rank <= 3 ? '800' : '600';
              return `
                <tr style="background:${bg};">
                  <td style="border:1px solid #e0e0e0; padding:6px; text-align:center; font-weight:${rankWeight}; color:${rankColor};">${row.rank}</td>
                  <td style="border:1px solid #e0e0e0; padding:6px 10px; font-weight:700; text-transform:uppercase; letter-spacing:0.3px;">${row.name}</td>
                  <td style="border:1px solid #e0e0e0; padding:6px 8px; text-align:center; color:var(--text-light); font-size:0.72rem;">${row.stream.replace('Grade ', 'G').replace(' ', '\u00A0')}</td>
                  ${subjects.map(subj => {
                    const d = row.subjects[subj];
                    if (!d) return `<td style="border:1px solid #e0e0e0; padding:6px; text-align:center; color:#ccc;">-</td>`;
                    return `<td style="border:1px solid #e0e0e0; padding:6px; text-align:center;">${d.marks}${isCBC ? `<br><span style="font-size:0.65rem;color:var(--text-light);">${d.grade}</span>` : ''}</td>`;
                  }).join('')}
                  <td style="border:1px solid #e0e0e0; padding:6px 8px; text-align:center; font-weight:800; font-size:0.85rem;">${row.totalMarks}</td>
                  <td style="border:1px solid #e0e0e0; padding:6px 8px; text-align:center; font-weight:700;">${row.averageMark || '0.0'}</td>
                  ${isCBC ? `<td style="border:1px solid #e0e0e0; padding:6px; text-align:center; font-weight:600; color:var(--primary);">${row.totalPoints}</td>` : ''}
                  <td style="border:1px solid #e0e0e0; padding:6px 8px; text-align:center; font-weight:800; color:${rankColor};">${row.rank}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
          <tfoot>
            <tr style="background:#0a1d37; color:#fff; font-weight:700;">
              <td colspan="3" style="border:1px solid #1a3a6b; padding:7px 10px; text-align:right; font-size:0.75rem; letter-spacing:0.5px; text-transform:uppercase;">Subject Average</td>
              ${subjects.map(subj => {
                const avg = subjectCounts[subj] ? (subjectTotals[subj] / subjectCounts[subj]).toFixed(1) : '0.0';
                return `<td style="border:1px solid #1a3a6b; padding:7px 6px; text-align:center;">${avg}</td>`;
              }).join('')}
              <td colspan="${isCBC ? 2 : 1}" style="border:1px solid #1a3a6b; padding:7px 8px; text-align:center;">CLASS AVG: ${classAvg}</td>
              ${isCBC ? '' : ''}
              <td style="border:1px solid #1a3a6b; padding:7px 6px;"></td>
            </tr>
          </tfoot>
        </table>
      `;
    };

    const loadBroadsheet = async () => {
      const meritContainer = document.getElementById('merit-list-container');
      if (!meritContainer) return;

      const gradeFilter  = meritGradeSelect.value;
      const streamFilter = meritStreamSelect.value;

      meritContainer.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-light);">Generating broadsheet...</div>`;

      try {
        const streamParam = streamFilter !== 'all' ? `&stream=${encodeURIComponent(streamFilter)}` : '';
        const data = await apiClient.get<any[]>(
          `/admin/merit-list?gradePrefix=${encodeURIComponent(gradeFilter)}&term=${term}&year=${year}&examType=${examType}${streamParam}`
        );

        const subjectSet = new Set<string>();
        data.forEach(m => Object.keys(m.subjects).forEach(s => subjectSet.add(s)));
        currentBroadsheetSubjects = Array.from(subjectSet).sort();
        currentBroadsheetData = data;
        isCBCGrade = ['Grade 7', 'Grade 8', 'Grade 9'].includes(gradeFilter);

        // Apply current sort
        const sorted = currentSortMode === 'merit'
          ? [...data].sort((a, b) => a.rank - b.rank)
          : [...data].sort((a, b) => { if (a.stream < b.stream) return -1; if (a.stream > b.stream) return 1; return a.name.localeCompare(b.name); });

        meritContainer.innerHTML = renderBroadsheet(sorted, currentBroadsheetSubjects, isCBCGrade);
      } catch (e: any) {
        meritContainer.innerHTML = `<div style="color:red; padding:20px;">Error generating broadsheet: ${e.message}</div>`;
      }
    };

    document.getElementById('btn-refresh-merit')?.addEventListener('click', loadBroadsheet);

    // Tab switching
    document.getElementById('tab-stream-merit')?.addEventListener('click', () => {
      currentSortMode = 'merit';
      const t1 = document.getElementById('tab-stream-merit')!;
      const t2 = document.getElementById('tab-grade-merit')!;
      t1.style.borderBottomColor = 'var(--crimson)'; t1.style.color = 'var(--navy)';
      t2.style.borderBottomColor = 'transparent'; t2.style.color = 'var(--text-light)';
      const sorted = [...currentBroadsheetData].sort((a, b) => a.rank - b.rank);
      const c = document.getElementById('merit-list-container');
      if (c && sorted.length) c.innerHTML = renderBroadsheet(sorted, currentBroadsheetSubjects, isCBCGrade);
    });

    document.getElementById('tab-grade-merit')?.addEventListener('click', () => {
      currentSortMode = 'class';
      const t1 = document.getElementById('tab-stream-merit')!;
      const t2 = document.getElementById('tab-grade-merit')!;
      t2.style.borderBottomColor = 'var(--crimson)'; t2.style.color = 'var(--navy)';
      t1.style.borderBottomColor = 'transparent'; t1.style.color = 'var(--text-light)';
      const sorted = [...currentBroadsheetData].sort((a, b) => {
        if (a.stream < b.stream) return -1;
        if (a.stream > b.stream) return 1;
        return a.name.localeCompare(b.name);
      });
      const c = document.getElementById('merit-list-container');
      if (c && sorted.length) c.innerHTML = renderBroadsheet(sorted, currentBroadsheetSubjects, isCBCGrade);
    });

    // Initial loads
    loadActiveAssignments();

  } catch (err: any) {
    container.innerHTML = `<div style="color:red; padding:20px;">Critical UI Error: ${err.message}</div>`;
  }
}
