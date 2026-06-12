import { apiClient } from '../../data/apiClient';
import { triggerToastNotification } from '../simulatorBar';

// ─── MODULE SINGLETONS ────────────────────────────────────
let persistentStream: MediaStream | null = null;
let allStudents: any[] = [];
let selectedStudent: any = null;

// ─── MAIN RENDER ─────────────────────────────────────────
export async function renderMarkingTab(container: HTMLElement, teacherId: string): Promise<void> {
  const term = 'Term 1'; const year = 2026; const examType = 'End Term';

  container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-light);">Loading marking session...</div>`;

  try {
    const assignments = await apiClient.get<any[]>(`/teachers/${teacherId}/assigned-marking?term=${term}&year=${year}`);

    if (!assignments.length) {
      container.innerHTML = `<div style="padding:48px;text-align:center;"><span style="font-size:3rem;">📋</span><h3 style="color:var(--primary);">No Grading Assignments</h3><p style="color:var(--text-light);">No cross-marking assigned for ${term} ${year}.</p></div>`;
      return;
    }

    // Load ALL students from ALL assignments in parallel
    const arrays = await Promise.all(assignments.map(a =>
      apiClient.get<any[]>(`/teachers/${teacherId}/assigned-marking/${a.assignment_id}/students?examType=${examType}`)
        .then(ss => ss.map(s => ({ ...s, assignment_id: a.assignment_id, subject_name: a.subject_name, class_name: a.class_name, term, year, examType })))
    ));
    allStudents = arrays.flat();

    container.innerHTML = buildUI(assignments, term, year);
    renderPending();
    bindAllEvents(teacherId);

  } catch (err: any) {
    container.innerHTML = `<div style="color:red;padding:20px;">Error: ${err.message}</div>`;
  }
}

// ─── UI BUILDER ───────────────────────────────────────────
function buildUI(assignments: any[], term: string, year: number) {
  const logged = allStudents.filter(s => s.raw_mark !== null).length;
  const total = allStudents.length;

  return `
<section class="card col-12 relative-card" style="padding:0;overflow:hidden;min-height:85vh;display:flex;flex-direction:column;">

  <!-- HEADER -->
  <div style="padding:14px 18px;background:var(--navy);color:white;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
    <div>
      <h3 style="margin:0;font-size:0.95rem;font-weight:700;">📝 ASSESSMENT STUDIO</h3>
      <p style="margin:0;font-size:0.72rem;opacity:0.7;">${term} ${year} · End Term · Random Pile Mode</p>
    </div>
    <div style="text-align:right;">
      <div id="progress-counter" style="font-size:1.6rem;font-weight:800;">${logged}/${total}</div>
      <div style="font-size:0.68rem;opacity:0.7;">students logged</div>
    </div>
  </div>

  <!-- ASSIGNMENT BADGES -->
  <div style="padding:8px 14px;background:#f8f9fc;border-bottom:1px solid var(--border);display:flex;gap:8px;flex-wrap:wrap;flex-shrink:0;">
    ${assignments.map(a => `<span style="background:white;border:1px solid var(--border);border-radius:20px;padding:3px 12px;font-size:0.72rem;font-weight:600;color:var(--navy);">${a.class_name} · ${a.subject_name}</span>`).join('')}
  </div>

  <!-- CAMERA WORKSPACE -->
  <div id="scanner-workspace" style="position:relative;flex:1;background:#0a1d37;min-height:440px;">

    <video id="main-camera" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover;display:block;"></video>

    <!-- [STATE: start] Camera not yet started -->
    <div id="ov-start" style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center;background:rgba(10,29,55,0.96);color:white;gap:16px;text-align:center;padding:24px;">
      <div style="font-size:3.5rem;">📷</div>
      <h3 style="margin:0;max-width:260px;line-height:1.4;">Tap to start your marking session</h3>
      <p style="margin:0;font-size:0.82rem;opacity:0.7;max-width:260px;">Pick up any paper from the pile. Search the student's name. Scan their mark. Repeat.</p>
      <button id="btn-start" style="background:var(--crimson);color:white;border:none;border-radius:12px;padding:14px 32px;font-size:1rem;font-weight:700;cursor:pointer;">Start Marking Session</button>
    </div>

    <!-- [STATE: idle] Camera live, searching for student -->
    <div id="ov-idle" style="position:absolute;inset:0;display:none;flex-direction:column;justify-content:space-between;padding:16px;">
      <div style="text-align:center;">
        <div style="background:rgba(10,29,55,0.78);color:white;border-radius:10px;padding:8px 16px;display:inline-block;backdrop-filter:blur(4px);">
          <p style="margin:0;font-size:0.82rem;font-weight:600;">📄 Pick up a paper → search the student's name below</p>
        </div>
      </div>
      <div style="background:rgba(10,29,55,0.9);border-radius:14px;padding:14px;backdrop-filter:blur(8px);">
        <input id="student-search" type="text" autocomplete="off" placeholder="🔍  Type name — e.g. 'OCHIENG' or 'FAITH'"
          style="width:100%;background:white;border:none;border-radius:8px;padding:13px 14px;font-size:1rem;box-sizing:border-box;outline:none;font-family:'Outfit',sans-serif;" />
        <div id="search-results" style="margin-top:8px;display:none;"></div>
      </div>
    </div>

    <!-- [STATE: selected] Student locked, aim and capture -->
    <div id="ov-selected" style="position:absolute;inset:0;display:none;flex-direction:column;justify-content:space-between;padding:16px;">
      <div style="background:var(--crimson);color:white;border-radius:12px;padding:12px 18px;text-align:center;">
        <p style="margin:0;font-size:0.68rem;text-transform:uppercase;letter-spacing:1px;opacity:0.85;">Now marking</p>
        <h3 id="sel-name" style="margin:3px 0 0;font-size:1.1rem;font-weight:800;"></h3>
        <p id="sel-sub" style="margin:2px 0 0;font-size:0.75rem;opacity:0.8;"></p>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
        <p style="margin:0;color:rgba(255,255,255,0.8);font-size:0.78rem;font-weight:600;letter-spacing:0.5px;">AIM AT THE FINAL MARK</p>
        <div style="border:2.5px solid rgba(255,255,255,0.8);border-radius:10px;width:220px;height:75px;box-shadow:0 0 0 9999px rgba(0,0,0,0.45);"></div>
      </div>
      <div style="display:flex;gap:10px;">
        <button id="btn-change" style="flex:1;background:rgba(255,255,255,0.12);color:white;border:1px solid rgba(255,255,255,0.3);border-radius:10px;padding:13px;font-size:0.85rem;cursor:pointer;">✕ Change</button>
        <button id="btn-capture" style="flex:2;background:var(--crimson);color:white;border:none;border-radius:10px;padding:13px;font-size:1rem;font-weight:700;cursor:pointer;">📷 Capture Mark</button>
      </div>
    </div>

    <!-- [STATE: confirming] Verify the AI-detected mark -->
    <div id="ov-confirming" style="position:absolute;inset:0;display:none;background:rgba(10,29,55,0.92);justify-content:center;align-items:center;padding:20px;">
      <div style="background:white;border-radius:16px;width:100%;max-width:440px;overflow:hidden;">
        <div style="padding:14px 18px;background:var(--surface);border-bottom:1px solid var(--border);">
          <p style="margin:0;font-size:0.68rem;color:var(--text-light);text-transform:uppercase;letter-spacing:0.5px;">Confirm Mark</p>
          <h4 id="conf-name" style="margin:3px 0 0;font-size:1rem;font-weight:800;color:var(--navy);"></h4>
        </div>
        <div style="display:flex;">
          <div style="flex:1;background:#f5f5f5;padding:16px;display:flex;align-items:center;justify-content:center;min-height:130px;">
            <img id="conf-img" src="" style="max-width:100%;max-height:130px;border-radius:6px;box-shadow:0 3px 10px rgba(0,0,0,0.15);" />
          </div>
          <div style="flex:1;padding:16px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:6px;">
            <p style="margin:0;font-size:0.65rem;color:var(--text-light);text-transform:uppercase;letter-spacing:1px;font-weight:700;">Detected Mark</p>
            <input type="number" id="conf-mark" min="0" max="100"
              style="font-size:3rem;font-weight:800;text-align:center;width:110px;border:2px solid var(--border);border-radius:10px;padding:4px;color:var(--navy);font-family:'Outfit',sans-serif;" />
            <p id="conf-confidence" style="margin:0;font-size:0.76rem;color:#16a34a;font-weight:600;">✓ Detected</p>
          </div>
        </div>
        <div style="padding:12px 16px;display:flex;gap:10px;border-top:1px solid var(--border);">
          <button id="btn-retake" style="flex:1;padding:11px;border:1px solid var(--border);border-radius:8px;background:white;cursor:pointer;font-size:0.85rem;">↩ Retake</button>
          <button id="btn-log" style="flex:2;padding:11px;border:none;border-radius:8px;background:var(--navy);color:white;cursor:pointer;font-size:0.9rem;font-weight:700;">✓ Confirm & Log</button>
        </div>
        <div style="padding:8px 16px;background:#fff5f5;border-top:1px solid #fecaca;text-align:center;">
          <p style="margin:0;font-size:0.7rem;color:#dc2626;font-weight:600;">⚠ Once confirmed, only Admin can modify this mark</p>
        </div>
      </div>
    </div>

    <!-- [STATE: success] Brief success flash -->
    <div id="ov-success" style="position:absolute;inset:0;display:none;background:rgba(22,163,74,0.88);flex-direction:column;justify-content:center;align-items:center;color:white;text-align:center;padding:24px;">
      <div style="font-size:4rem;line-height:1;">✓</div>
      <h2 id="succ-msg" style="margin:10px 0;font-size:1.2rem;"></h2>
      <p style="margin:0;font-size:0.85rem;opacity:0.85;">Pick up the next paper from the pile ↓</p>
    </div>
  </div>

  <!-- PENDING PANEL -->
  <div style="padding:10px 14px;border-top:1px solid var(--border);background:#f8f9fc;flex-shrink:0;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <span style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-light);">Still Pending</span>
      <span id="pend-badge" style="font-size:0.72rem;color:var(--crimson);font-weight:700;"></span>
    </div>
    <div id="pend-chips" style="display:flex;gap:6px;flex-wrap:wrap;max-height:72px;overflow-y:auto;"></div>
  </div>
</section>`;
}

// ─── RENDER HELPERS ───────────────────────────────────────
function renderPending() {
  const pending = allStudents.filter(s => s.raw_mark === null);
  const logged = allStudents.filter(s => s.raw_mark !== null).length;

  const counter = document.getElementById('progress-counter');
  const badge   = document.getElementById('pend-badge');
  const chips   = document.getElementById('pend-chips');

  if (counter) counter.textContent = `${logged}/${allStudents.length}`;
  if (badge)   badge.textContent = `${pending.length} remaining`;
  if (!chips)  return;

  if (!pending.length) {
    chips.innerHTML = `<span style="color:#16a34a;font-weight:700;font-size:0.85rem;">🎉 All students logged!</span>`;
    return;
  }
  chips.innerHTML = pending.map(s =>
    `<span style="background:white;border:1px solid #fde68a;border-radius:20px;padding:3px 10px;font-size:0.72rem;font-weight:600;color:var(--navy);white-space:nowrap;">${s.name}</span>`
  ).join('');
}

function showOverlay(state: 'start'|'idle'|'selected'|'confirming'|'success') {
  ['ov-start','ov-idle','ov-selected','ov-confirming','ov-success'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const target = document.getElementById(`ov-${state}`);
  if (target) target.style.display = 'flex';
}

// ─── CAMERA ───────────────────────────────────────────────
async function startCamera(): Promise<boolean> {
  const video = document.getElementById('main-camera') as HTMLVideoElement;
  if (!video) return false;
  if (persistentStream?.active) { video.srcObject = persistentStream; return true; }
  try {
    persistentStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    video.srcObject = persistentStream;
    return true;
  } catch {
    triggerToastNotification('Camera access denied.', 'error');
    return false;
  }
}

// ─── IMAGE PRE-PROCESSING ─────────────────────────────────
function captureProcessed(): string {
  const video = document.getElementById('main-camera') as HTMLVideoElement;
  if (!video) return '';
  // Crop center ROI (50%W × 55%H)
  const sx = video.videoWidth * 0.25, sy = video.videoHeight * 0.225;
  const sw = video.videoWidth * 0.50, sh = video.videoHeight * 0.55;
  const scale = Math.min(1, 800 / sw);
  const c = document.createElement('canvas');
  c.width = Math.round(sw * scale); c.height = Math.round(sh * scale);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height);
  // Grayscale + 1.8× contrast
  const img = ctx.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < img.data.length; i += 4) {
    const g = 0.299*img.data[i] + 0.587*img.data[i+1] + 0.114*img.data[i+2];
    const b = Math.min(255, Math.max(0, (g - 128) * 1.8 + 128));
    img.data[i] = img.data[i+1] = img.data[i+2] = b;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL('image/jpeg', 0.88);
}

// ─── FUZZY SEARCH ─────────────────────────────────────────
function fuzzySearch(q: string) {
  const lq = q.toLowerCase().trim();
  if (lq.length < 2) return [];
  return allStudents.filter(s => s.raw_mark === null && s.name.toLowerCase().includes(lq)).slice(0, 6);
}

function renderResults(results: any[]) {
  const box = document.getElementById('search-results');
  if (!box) return;
  if (!results.length) { box.style.display = 'none'; return; }
  box.style.display = 'block';
  box.innerHTML = results.map(s => `
    <div class="sr-item" data-sid="${s.id}"
      style="background:white;border-radius:8px;padding:10px 14px;margin-bottom:6px;cursor:pointer;
             display:flex;justify-content:space-between;align-items:center;border:1px solid #e5e7eb;">
      <div>
        <strong style="font-size:0.88rem;color:var(--navy);">${s.name}</strong>
        <span style="display:block;font-size:0.7rem;color:var(--text-light);">${s.class_name} · ${s.subject_name}</span>
      </div>
      <span style="background:#fef3c7;color:#b45309;padding:3px 10px;border-radius:12px;font-size:0.68rem;font-weight:700;">Pending</span>
    </div>`).join('');
}

function selectStudent(sid: string) {
  selectedStudent = allStudents.find(s => s.id === sid) || null;
  if (!selectedStudent) return;

  const nameEl = document.getElementById('sel-name');
  const subEl  = document.getElementById('sel-sub');
  if (nameEl) nameEl.textContent = selectedStudent.name;
  if (subEl)  subEl.textContent  = `${selectedStudent.class_name} · ${selectedStudent.subject_name}`;

  const input = document.getElementById('student-search') as HTMLInputElement;
  if (input) input.value = '';
  const box = document.getElementById('search-results');
  if (box) box.style.display = 'none';

  showOverlay('selected');
}

// ─── EVENT BINDINGS ───────────────────────────────────────
function bindAllEvents(teacherId: string) {

  // Start camera
  document.getElementById('btn-start')?.addEventListener('click', async () => {
    const ok = await startCamera();
    if (ok) showOverlay('idle');
  });

  // Search input — 120ms debounce
  let t: ReturnType<typeof setTimeout>;
  document.getElementById('student-search')?.addEventListener('input', e => {
    clearTimeout(t);
    t = setTimeout(() => {
      const q = (e.target as HTMLInputElement).value;
      renderResults(fuzzySearch(q));
    }, 120);
  });

  // Search result item click (delegated)
  document.getElementById('search-results')?.addEventListener('click', e => {
    const item = (e.target as HTMLElement).closest('.sr-item') as HTMLElement;
    if (item) selectStudent(item.dataset.sid!);
  });

  // Change student
  document.getElementById('btn-change')?.addEventListener('click', () => {
    selectedStudent = null;
    const input = document.getElementById('student-search') as HTMLInputElement;
    if (input) { input.value = ''; input.focus(); }
    const box = document.getElementById('search-results');
    if (box) box.style.display = 'none';
    showOverlay('idle');
  });

  // Capture
  document.getElementById('btn-capture')?.addEventListener('click', async () => {
    if (!selectedStudent) return;
    const base64 = captureProcessed();
    if (!base64) return;

    const confImg = document.getElementById('conf-img') as HTMLImageElement;
    const confMark = document.getElementById('conf-mark') as HTMLInputElement;
    const confName = document.getElementById('conf-name');
    const confConf = document.getElementById('conf-confidence');

    if (confImg) confImg.src = base64;
    if (confName) confName.textContent = selectedStudent.name;
    if (confMark) { confMark.value = ''; confMark.placeholder = '...'; }
    if (confConf) { confConf.textContent = 'Scanning...'; confConf.style.color = 'var(--text-light)'; }

    showOverlay('confirming');

    // Send to AI scan endpoint
    try {
      const result = await apiClient.post<any>('/ai/scan', { imageBase64: base64 });
      if (result.detectedMark !== null) {
        if (confMark) confMark.value = String(result.detectedMark);
        if (confConf) { confConf.textContent = '✓ High Confidence Scan'; confConf.style.color = '#16a34a'; }
      } else {
        if (confMark) { confMark.value = ''; confMark.placeholder = 'Enter manually'; }
        if (confConf) { confConf.textContent = '⚠ Enter mark manually'; confConf.style.color = '#b45309'; }
      }
      if (confMark) confMark.focus();
    } catch {
      if (confMark) { confMark.value = ''; confMark.placeholder = 'Scan failed — type mark'; }
      if (confConf) { confConf.textContent = '⚠ Scan failed — type mark'; confConf.style.color = '#dc2626'; }
      triggerToastNotification('AI scan failed. Type the mark manually.', 'warning');
    }
  });

  // Retake
  document.getElementById('btn-retake')?.addEventListener('click', () => showOverlay('selected'));

  // Confirm & Log (OPTIMISTIC)
  document.getElementById('btn-log')?.addEventListener('click', async () => {
    const confMark = document.getElementById('conf-mark') as HTMLInputElement;
    const raw = parseInt(confMark?.value, 10);
    if (isNaN(raw) || raw < 0 || raw > 100) {
      triggerToastNotification('Enter a valid mark (0–100).', 'error');
      return;
    }
    if (!selectedStudent) return;

    const student = selectedStudent;

    // ── OPTIMISTIC: update UI immediately ──
    const idx = allStudents.findIndex(s => s.id === student.id);
    if (idx !== -1) allStudents[idx].raw_mark = raw;
    renderPending();

    // Show success flash
    const succMsg = document.getElementById('succ-msg');
    if (succMsg) succMsg.textContent = `Logged ${raw} for ${student.name}`;
    showOverlay('success');
    selectedStudent = null;

    // Reset to idle after 1.5s
    setTimeout(() => showOverlay('idle'), 1500);

    // ── BACKGROUND SAVE ──
    apiClient.post(`/teachers/${teacherId}/confirm-mark`, {
      studentId: student.id,
      subjectName: student.subject_name,
      examType: student.examType,
      term: student.term,
      year: student.year,
      rawMark: raw
    }).catch(() => {
      // Revert on failure
      if (idx !== -1) allStudents[idx].raw_mark = null;
      renderPending();
      triggerToastNotification(`Save failed for ${student.name}. Please retry.`, 'error');
    });
  });
}
