import { apiClient } from '../../data/apiClient';
import { getDb } from '../../data/mockDb';
import { triggerToastNotification } from '../simulatorBar';

let streamObj: MediaStream | null = null;

export async function renderMarkingTab(container: HTMLElement, teacherId: string): Promise<void> {
  container.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--text-light);">Loading assigned marking...</div>`;

  const term = 'Term 1';
  const year = 2026;

  try {
    const assignments = await apiClient.get<any[]>(`/teachers/${teacherId}/assigned-marking?term=${term}&year=${year}`);

    if (assignments.length === 0) {
      container.innerHTML = `
        <div style="background:#FAFBFD; border:1px solid var(--border); padding:48px; border-radius:12px; text-align:center; max-width:520px; margin:0 auto;">
          <span style="font-size:3rem; display:block; margin-bottom:16px;">📋</span>
          <h3 style="margin-bottom:8px; color:var(--primary);">No Grading Assignments</h3>
          <p style="color:var(--text-light); font-size:0.9rem; line-height:1.6;">
            The administrator has not assigned you any cross-marking duties for <strong>${term} ${year}</strong>.
          </p>
        </div>
      `;
      return;
    }

    // Fetch student counts per assignment for completion rings
    const examType = 'End Term';

    container.innerHTML = `
      <!-- ASSESSMENT STUDIO HEADER -->
      <section class="card col-12 relative-card" style="margin-bottom: 24px;">
        <div style="display:flex; align-items:center; gap:14px; margin-bottom:6px;">
          <div style="background:var(--crimson); color:#fff; border-radius:8px; padding:8px 12px; font-size:1.1rem;">📝</div>
          <div>
            <h2 class="card-title" style="margin-bottom:2px;">ASSESSMENT STUDIO</h2>
            <p style="color:var(--text-light); font-size:0.82rem; margin:0;">${term} ${year} · End Term Exam · Cross-Marking</p>
          </div>
        </div>
        <p style="color:var(--text-light); font-size:0.85rem; margin-bottom:20px; margin-top:8px;">
          Select an assignment card below to view your student marking list.
        </p>

        <!-- ASSIGNMENT CARDS -->
        <div id="assignment-cards" style="display:flex; gap:16px; flex-wrap:wrap; margin-bottom:24px;">
          ${assignments.map(a => `
            <div class="marking-assignment-card" data-id="${a.assignment_id}"
              style="border:2px solid var(--border); border-radius:12px; padding:18px 20px; background:#fff;
                     cursor:pointer; transition:all 0.18s; min-width:200px; flex:1; max-width:260px; position:relative; overflow:hidden;">
              <div style="position:absolute; top:0; left:0; width:4px; height:100%; background:var(--crimson); border-radius:12px 0 0 12px;"></div>
              <div style="padding-left:8px;">
                <p style="font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-light); margin:0 0 4px 0;">${a.class_name}</p>
                <p style="font-size:1rem; font-weight:800; color:var(--navy); margin:0 0 14px 0;">${a.subject_name}</p>
                <div style="display:flex; align-items:center; gap:10px;">
                  <div id="ring-${a.assignment_id}" style="width:44px; height:44px; position:relative; flex-shrink:0;">
                    <svg width="44" height="44" viewBox="0 0 44 44">
                      <circle cx="22" cy="22" r="18" fill="none" stroke="#e8e8e8" stroke-width="4"/>
                      <circle id="ring-progress-${a.assignment_id}" cx="22" cy="22" r="18" fill="none" stroke="var(--crimson)" stroke-width="4"
                        stroke-dasharray="113" stroke-dashoffset="113" stroke-linecap="round" transform="rotate(-90 22 22)"/>
                    </svg>
                    <span id="ring-pct-${a.assignment_id}" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:0.6rem;font-weight:800;color:var(--navy);">--</span>
                  </div>
                  <div>
                    <p id="ring-label-${a.assignment_id}" style="font-size:0.75rem; color:var(--text-light); margin:0;">Loading...</p>
                  </div>
                </div>
              </div>
            </div>
          `).join('')}
        </div>

        <!-- STUDENT MARKING LIST (loads on card click) -->
        <div id="marking-students-container">
          <div style="text-align:center; padding:24px; color:var(--text-light); font-style:italic; font-size:0.9rem;">
            Select an assignment above to view students.
          </div>
        </div>
      </section>

      <!-- FULLSCREEN CAMERA SCANNER -->
      <div id="camera-scanner-modal" style="display:none; position:fixed; top:0; left:0; width:100vw; height:100vh; background:#000; z-index:9999; flex-direction:column;">
        <div style="padding:14px 18px; display:flex; justify-content:space-between; align-items:center; background:#111; color:white; flex-shrink:0;">
          <h3 id="scanner-header-title" style="margin:0; font-size:0.95rem; font-weight:600; font-family:'Outfit',sans-serif;">AI Assessment Scanner</h3>
          <button id="close-camera-btn" style="background:transparent; color:white; border:none; font-size:1.6rem; cursor:pointer; line-height:1;">&times;</button>
        </div>
        <div style="flex:1; position:relative; overflow:hidden;">
          <video id="camera-preview" autoplay playsinline style="width:100%; height:100%; object-fit:cover;"></video>
          <!-- Scanning overlay -->
          <div style="position:absolute; inset:0; background:rgba(0,0,0,0.45); pointer-events:none;"></div>
          <!-- Reticle -->
          <div style="position:absolute; width:220px; height:90px; top:50%; left:50%; transform:translate(-50%,-50%); pointer-events:none;">
            <div style="position:absolute; inset:0; border:2.5px solid rgba(255,255,255,0.85); border-radius:10px; box-shadow: 0 0 0 9999px rgba(0,0,0,0.5);"></div>
            <div style="position:absolute; top:-26px; width:100%; text-align:center; color:white; font-size:0.75rem; font-weight:700; letter-spacing:0.5px; text-shadow: 0 1px 4px black; font-family:'Outfit',sans-serif;">ALIGN HANDWRITTEN MARK HERE</div>
            <!-- Corner decorations -->
            <div style="position:absolute;top:-2px;left:-2px;width:14px;height:14px;border-top:3px solid white;border-left:3px solid white;border-radius:3px 0 0 0;"></div>
            <div style="position:absolute;top:-2px;right:-2px;width:14px;height:14px;border-top:3px solid white;border-right:3px solid white;border-radius:0 3px 0 0;"></div>
            <div style="position:absolute;bottom:-2px;left:-2px;width:14px;height:14px;border-bottom:3px solid white;border-left:3px solid white;border-radius:0 0 0 3px;"></div>
            <div style="position:absolute;bottom:-2px;right:-2px;width:14px;height:14px;border-bottom:3px solid white;border-right:3px solid white;border-radius:0 0 3px 0;"></div>
          </div>
        </div>
        <div style="padding:24px 32px; display:flex; justify-content:center; align-items:center; gap:40px; background:#111; flex-shrink:0;">
          <button id="close-camera-btn2" style="background:rgba(255,255,255,0.1); color:white; border:1px solid rgba(255,255,255,0.3); border-radius:8px; padding:8px 20px; font-size:0.85rem; cursor:pointer; font-family:'Outfit',sans-serif;">✕ Close</button>
          <button id="capture-scan-btn" style="width:68px; height:68px; border-radius:50%; background:white; border:5px solid rgba(255,255,255,0.4); cursor:pointer; transition:transform 0.15s; flex-shrink:0;" onmousedown="this.style.transform='scale(0.92)'" onmouseup="this.style.transform='scale(1)'"></button>
          <div style="width:60px;"></div>
        </div>
      </div>

      <!-- VERIFICATION MODAL -->
      <div id="verification-modal" style="display:none; position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(10,29,55,0.75); z-index:10000; justify-content:center; align-items:center; padding:20px; box-sizing:border-box;">
        <div style="background:white; border-radius:16px; width:100%; max-width:580px; overflow:hidden; box-shadow:0 24px 60px rgba(0,0,0,0.35);">
          <!-- Modal Header -->
          <div style="padding:18px 24px; border-bottom:1px solid var(--border); background:var(--surface);">
            <h3 style="margin:0 0 2px 0; font-size:1rem; font-weight:700;">Verify Scanned Mark</h3>
            <p id="verify-student-name" style="margin:0; font-size:0.85rem; color:var(--text-light);">Student Name</p>
          </div>
          <!-- Modal Body -->
          <div style="display:flex; flex-wrap:wrap;">
            <!-- Left: Photo -->
            <div style="flex:1; min-width:220px; padding:24px; background:#f5f5f5; display:flex; justify-content:center; align-items:center;">
              <img id="verify-image" src="" style="max-width:100%; max-height:180px; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.15);" />
            </div>
            <!-- Right: AI Result -->
            <div style="flex:1; min-width:220px; padding:32px 24px; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center;">
              <p style="margin:0 0 6px 0; font-size:0.72rem; color:var(--text-light); text-transform:uppercase; letter-spacing:1px; font-weight:700;">Detected Mark</p>
              <input type="number" id="verify-mark-input"
                style="font-size:3.5rem; font-weight:800; text-align:center; width:120px; border:2px solid var(--border); border-radius:12px; padding:8px; margin-bottom:8px; color:var(--navy); font-family:'Outfit',sans-serif;" />
              <p id="verify-confidence-text" style="margin:0 0 20px 0; font-size:0.82rem; color:#16a34a; font-weight:600;">✓ High Confidence Scan</p>
              <div style="width:100%; display:flex; gap:10px;">
                <button id="verify-retake-btn" class="btn-outline" style="flex:1; font-size:0.85rem;">Retake</button>
                <button id="verify-confirm-btn" class="btn-primary" style="flex:2; font-size:0.85rem;">Confirm &amp; Log</button>
              </div>
            </div>
          </div>
          <!-- Immutability Warning -->
          <div style="padding:12px 24px; background:#fff5f5; border-top:1px solid #fecaca; text-align:center;">
            <p style="margin:0; font-size:0.78rem; color:#dc2626; font-weight:600;">
              ⚠️ Once confirmed, this mark is immutable — only the Administrator can modify it.
            </p>
          </div>
        </div>
      </div>
    `;

    // Load progress rings for each assignment
    const loadRings = async () => {
      for (const a of assignments) {
        try {
          const students = await apiClient.get<any[]>(
            `/teachers/${teacherId}/assigned-marking/${a.assignment_id}/students?examType=${examType}`
          );
          const total = students.length;
          const logged = students.filter(s => s.raw_mark !== null).length;
          const pct = total > 0 ? Math.round((logged / total) * 100) : 0;
          const circumference = 113;
          const offset = circumference - (pct / 100) * circumference;

          const ring = document.getElementById(`ring-progress-${a.assignment_id}`);
          const label = document.getElementById(`ring-label-${a.assignment_id}`);
          const pctEl = document.getElementById(`ring-pct-${a.assignment_id}`);
          if (ring) ring.setAttribute('stroke-dashoffset', String(offset));
          if (label) label.textContent = `${logged}/${total} Logged`;
          if (pctEl) pctEl.textContent = `${pct}%`;
        } catch { /* ring stays at default */ }
      }
    };
    loadRings();

    // Bind assignment card clicks
    const cards = container.querySelectorAll('.marking-assignment-card');
    cards.forEach(card => {
      card.addEventListener('click', () => {
        cards.forEach(c => {
          (c as HTMLElement).style.borderColor = 'var(--border)';
          (c as HTMLElement).style.background = '#fff';
        });
        (card as HTMLElement).style.borderColor = 'var(--crimson)';
        (card as HTMLElement).style.background = '#fff8f8';

        const assignmentId = card.getAttribute('data-id')!;
        const assignment = assignments.find(a => a.assignment_id == assignmentId);
        loadStudentsForMarking(teacherId, assignmentId, assignment, term, year);
      });
    });

  } catch (err: any) {
    container.innerHTML = `<div style="color:red; padding:20px;">Error loading marking portal: ${err.message}</div>`;
  }
}

let activeStudentIdToMark: string | null = null;
let activeAssignmentDetails: any = null;

async function loadStudentsForMarking(
  teacherId: string, assignmentId: string, assignment: any, term: string, year: number
) {
  const container = document.getElementById('marking-students-container');
  if (!container) return;

  container.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-light);">Loading students...</div>`;

  const examType = 'End Term';

  try {
    const students = await apiClient.get<any[]>(
      `/teachers/${teacherId}/assigned-marking/${assignmentId}/students?examType=${examType}`
    );
    activeAssignmentDetails = { ...assignment, term, year, examType };

    const logged = students.filter(s => s.raw_mark !== null).length;
    const total = students.length;

    container.innerHTML = `
      <div style="border-top:1px solid var(--border); padding-top:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <h3 style="margin:0; font-size:0.9rem; font-weight:700; color:var(--navy);">
            ${assignment.class_name} — ${assignment.subject_name}
          </h3>
          <span style="font-size:0.82rem; color:var(--text-light);">${logged}/${total} logged</span>
        </div>
        ${students.length === 0
          ? `<p style="text-align:center; color:var(--text-light); padding:20px;">No students found in ${assignment.class_name}.</p>`
          : `<div class="table-wrapper">
              <table class="premium-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Student Name</th>
                    <th style="text-align:center;">Status</th>
                    <th style="text-align:center;">Mark</th>
                    <th style="text-align:center;">CBC Grade</th>
                    <th style="text-align:right;">Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${students.map((s, idx) => `
                    <tr>
                      <td style="color:var(--text-light); font-size:0.8rem;">${idx + 1}</td>
                      <td>
                        <strong style="font-size:0.88rem;">${s.name}</strong>
                        <br><span style="font-size:0.72rem; color:var(--text-light);">ID: ${s.id}</span>
                      </td>
                      <td style="text-align:center;">
                        ${s.raw_mark !== null
                          ? `<span style="background:#dcfce7; color:#16a34a; padding:3px 10px; border-radius:20px; font-size:0.72rem; font-weight:700;">✓ Logged</span>`
                          : `<span style="background:#fef3c7; color:#b45309; padding:3px 10px; border-radius:20px; font-size:0.72rem; font-weight:700;">Pending</span>`}
                      </td>
                      <td style="text-align:center; font-weight:700; font-size:1rem; color:var(--navy);">
                        ${s.raw_mark !== null ? s.raw_mark : '<span style="color:#ccc;">--</span>'}
                      </td>
                      <td style="text-align:center;">
                        ${s.cbc_points !== null
                          ? `<span style="color:var(--primary); font-weight:700;">${s.cbc_grade}</span>
                             <br><span style="font-size:0.72rem; color:var(--text-light);">${s.cbc_points} pts</span>`
                          : '<span style="color:#ccc;">--</span>'}
                      </td>
                      <td style="text-align:right;">
                        ${s.raw_mark !== null
                          ? `<span style="font-size:0.78rem; color:var(--text-light);">🔒 Immutable</span>`
                          : `<button class="btn-primary open-scanner-btn" data-student-id="${s.id}" data-student-name="${s.name}"
                               style="font-size:0.8rem; padding:6px 14px; display:inline-flex; align-items:center; gap:6px;">
                               📷 Upload Mark
                             </button>`}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>`
        }
      </div>
    `;

    container.querySelectorAll('.open-scanner-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        const el = e.currentTarget as HTMLElement;
        openCameraScanner(el.getAttribute('data-student-id')!, el.getAttribute('data-student-name')!);
      });
    });

  } catch {
    container.innerHTML = `<div style="color:red;">Error loading students.</div>`;
  }
}

// ═══════════════════════════════════════════════════
// CAMERA SCANNER
// ═══════════════════════════════════════════════════

async function openCameraScanner(studentId: string, studentName: string) {
  activeStudentIdToMark = studentId;
  const modal = document.getElementById('camera-scanner-modal');
  const video = document.getElementById('camera-preview') as HTMLVideoElement;
  const headerTitle = document.getElementById('scanner-header-title');
  if (!modal || !video) return;

  if (headerTitle) headerTitle.textContent = `AI Assessment Scanner — ${studentName}`;

  // Prefill student name in verification modal
  const nameEl = document.getElementById('verify-student-name');
  if (nameEl) nameEl.textContent = studentName;

  modal.style.display = 'flex';

  try {
    streamObj = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false
    });
    video.srcObject = streamObj;
  } catch {
    triggerToastNotification('Camera access denied or unavailable.', 'error');
    closeCameraScanner();
    return;
  }

  document.getElementById('close-camera-btn')!.onclick = closeCameraScanner;
  document.getElementById('close-camera-btn2')!.onclick = closeCameraScanner;
  document.getElementById('capture-scan-btn')!.onclick = () => captureAndScanFrame(video);
}

function closeCameraScanner() {
  const modal = document.getElementById('camera-scanner-modal');
  if (modal) modal.style.display = 'none';
  if (streamObj) { streamObj.getTracks().forEach(t => t.stop()); streamObj = null; }
}

async function captureAndScanFrame(video: HTMLVideoElement) {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const base64Image = canvas.toDataURL('image/jpeg', 0.85);
  closeCameraScanner();

  const verifyModal   = document.getElementById('verification-modal');
  const verifyImg     = document.getElementById('verify-image') as HTMLImageElement;
  const verifyInput   = document.getElementById('verify-mark-input') as HTMLInputElement;
  const confirmBtn    = document.getElementById('verify-confirm-btn') as HTMLButtonElement;
  const confidenceEl  = document.getElementById('verify-confidence-text');
  if (!verifyModal || !verifyImg || !verifyInput || !confirmBtn) return;

  verifyImg.src = base64Image;
  verifyInput.value = '';
  verifyInput.placeholder = '...';
  verifyInput.disabled = true;
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Scanning with AI...';
  if (confidenceEl) { confidenceEl.textContent = 'Analyzing...'; confidenceEl.style.color = 'var(--text-light)'; }
  verifyModal.style.display = 'flex';

  try {
    triggerToastNotification('Analyzing handwriting with AI...', 'info');
    const response = await apiClient.post<any>('/ai/scan', { imageBase64: base64Image });

    verifyInput.disabled = false;
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Confirm & Log';

    if (response.detectedMark !== null) {
      verifyInput.value = String(response.detectedMark);
      if (confidenceEl) { confidenceEl.textContent = '✓ High Confidence Scan'; confidenceEl.style.color = '#16a34a'; }
      triggerToastNotification('Mark detected successfully!', 'success');
    } else {
      verifyInput.value = '';
      verifyInput.placeholder = 'Enter manually';
      if (confidenceEl) { confidenceEl.textContent = '⚠ Could not detect — enter manually'; confidenceEl.style.color = '#b45309'; }
      triggerToastNotification('Could not auto-detect mark. Please enter manually.', 'warning');
    }

    confirmBtn.onclick = async () => {
      const finalMark = parseInt(verifyInput.value, 10);
      if (isNaN(finalMark) || finalMark < 0 || finalMark > 100) {
        triggerToastNotification('Enter a valid mark between 0 and 100.', 'error');
        return;
      }
      await confirmAndLogMark(finalMark);
    };

    document.getElementById('verify-retake-btn')!.onclick = () => {
      verifyModal.style.display = 'none';
      const studentName = document.getElementById('verify-student-name')!.textContent || '';
      openCameraScanner(activeStudentIdToMark!, studentName);
    };

  } catch {
    verifyModal.style.display = 'none';
    triggerToastNotification('Failed to process image scan.', 'error');
  }
}

async function confirmAndLogMark(rawMark: number) {
  const verifyModal = document.getElementById('verification-modal');
  try {
    const teacherId = getDb().currentUser?.id;
    if (!teacherId || !activeStudentIdToMark || !activeAssignmentDetails) return;

    const confirmBtn = document.getElementById('verify-confirm-btn') as HTMLButtonElement;
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Saving...'; }

    triggerToastNotification('Saving mark immutably to database...', 'info');

    await apiClient.post(`/teachers/${teacherId}/confirm-mark`, {
      studentId: activeStudentIdToMark,
      subjectName: activeAssignmentDetails.subject_name,
      examType: activeAssignmentDetails.examType,
      term: activeAssignmentDetails.term,
      year: activeAssignmentDetails.year,
      rawMark: rawMark
    });

    triggerToastNotification('Mark saved successfully! ✓', 'success');
    if (verifyModal) verifyModal.style.display = 'none';

    loadStudentsForMarking(
      teacherId,
      activeAssignmentDetails.assignment_id,
      activeAssignmentDetails,
      activeAssignmentDetails.term,
      activeAssignmentDetails.year
    );

  } catch (error: any) {
    triggerToastNotification(error.message || 'Failed to save mark.', 'error');
    const confirmBtn = document.getElementById('verify-confirm-btn') as HTMLButtonElement;
    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Confirm & Log'; }
  }
}
