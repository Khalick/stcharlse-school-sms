import { getDb, saveDb } from '../data/mockDb';
import type { StudyMaterial } from '../data/mockDb';
import { generateAiResponse, getQuizForMaterial } from '../lib/aiService';
import type { QuizQuestion } from '../lib/aiService';
import { speakText, stopSpeaking, triggerHapticVibration } from '../lib/audioService';
import { triggerToastNotification } from './simulatorBar';
import { apiClient } from '../data/apiClient';

let activeStudentId = 'S001';
let activeMaterialId = 'M001';
let chatHistory: Record<string, { sender: 'user' | 'assistant'; text: string }[]> = {};
let isTtsActive = false;

// Voice Mode State
let isVoiceModeActive = false;
let recognitionInstance: any = null;

// Quiz State
let quizQuestions: QuizQuestion[] = [];
let currentQuizIdx = 0;
let quizScore = 0;
let answeredIdx: number | null = null;
let isGeneratingQuiz = false;
let generatedQuizMaterialId: string | null = null;

// Study Hub State
let studyHubMessages: any[] = [];
let studyHubPolling: any = null;
let lastHubStream = '';
let isGeneratingChat = false;

// Cached data to avoid re-fetching on every internal re-render (quiz click, chat msg etc.)
let cachedStudents: any[] | null = null;
let cachedMaterials: StudyMaterial[] | null = null;

export async function renderStudentPortal(container: HTMLElement): Promise<void> {
  const db = getDb();
  
  // Align active IDs
  const loggedInStudentId = db.currentUser?.id;
  if (db.currentUser?.role === 'student' && loggedInStudentId) {
    activeStudentId = loggedInStudentId;
    db.activeStudentId = loggedInStudentId;
  } else if (!db.activeStudentId) {
    db.activeStudentId = activeStudentId;
  } else {
    activeStudentId = db.activeStudentId;
  }
  
  if (!db.activeMaterialId) {
    db.activeMaterialId = activeMaterialId;
  } else {
    activeMaterialId = db.activeMaterialId;
  }

  try {
    // Fetch students list (cached to avoid flicker on quiz/chat interactions)
    if (!cachedStudents) {
      cachedStudents = await apiClient.get<any[]>('/students');
    }
    const allStudents = cachedStudents;

    const student = allStudents.find(s => s.id === activeStudentId) || allStudents[0];
    
    // Fetch study materials for student's stream (cached)
    if (!cachedMaterials) {
      cachedMaterials = await apiClient.get<StudyMaterial[]>(`/materials?grade=${encodeURIComponent(student.stream)}`);
    }
    const studentMaterials = cachedMaterials;
    
    // If the active material isn't matching student class, default to their first material
    let material = studentMaterials.find(m => m.id === activeMaterialId);
    if (!material) {
      material = studentMaterials[0];
      if (material) {
        activeMaterialId = material.id;
        db.activeMaterialId = activeMaterialId;
        saveDb(db);
      }
    }

    // Handle case where no materials exist at all
    if (!material) {
      container.innerHTML = `
        <div class="user-switch-bar" style="display: flex; justify-content: space-between; align-items: center;">
          <div class="workspace-header-text">
            <h2>Distraction-Free Student Study Vault</h2>
            <p>Student: <strong>${student.name} (${student.id})</strong> | Assigned Class: <strong>${student.stream}</strong></p>
          </div>
          <div class="gamification-widget" style="display: flex; gap: 16px; background: rgba(255,255,255,0.1); padding: 8px 16px; border-radius: 20px;">
            <div style="text-align: center;">
              <span style="font-size: 1.2rem;">🔥</span><br>
              <strong style="color: var(--gold-light); font-size: 0.9rem;">${student.current_streak || 0} Day Streak</strong>
            </div>
            <div style="text-align: center;">
              <span style="font-size: 1.2rem;">⭐</span><br>
              <strong style="color: var(--gold-light); font-size: 0.9rem;">${student.xp_points || 0} XP</strong>
            </div>
          </div>
        </div>
        <div style="padding: 48px; text-align:center;">
          <h3 style="color: var(--primary);">No Study Materials Available Yet</h3>
          <p style="color: var(--text-light); margin-top: 8px;">Your teachers have not uploaded any study documents for ${student.stream} yet. Check back soon!</p>
        </div>
      `;
      return;
    }

    // Initialize chat history for this student + material combo if empty
    const chatKey = `${student.id}_${material.id}`;
    if (!chatHistory[chatKey]) {
      chatHistory[chatKey] = [
        { sender: 'assistant', text: `Hi **${student.name}**! I'm Charlie, your private AI Study Companion. Let's study **"${material.title}"** together. Ask me any questions or click below to start a quiz!` }
      ];
    }
    
    // Load adaptive quiz if empty
    if (quizQuestions.length === 0 && !isGeneratingQuiz && generatedQuizMaterialId !== material.id) {
      isGeneratingQuiz = true;
      generatedQuizMaterialId = material.id;
      apiClient.post('/ai/generate-quiz', { materialId: material.id, stream: student.stream })
        .then((res: any) => {
          quizQuestions = res.questions || [];
          isGeneratingQuiz = false;
          resetQuizState();
          renderStudentPortal(container);
        })
        .catch(err => {
          console.error('Failed to generate adaptive quiz:', err);
          quizQuestions = []; // fallback or empty
          isGeneratingQuiz = false;
          renderStudentPortal(container);
        });
    }

    // Initialize Study Hub Polling for this stream
    if (lastHubStream !== student.stream) {
      lastHubStream = student.stream;
      studyHubMessages = [];
      if (studyHubPolling) clearInterval(studyHubPolling);
      
      const fetchHub = () => {
        apiClient.get<any>(`/students/study-hub/${encodeURIComponent(student.stream)}`)
          .then(res => {
            if (res.messages && res.messages.length !== studyHubMessages.length) {
              studyHubMessages = res.messages;
              renderStudentPortal(container);
            }
          })
          .catch(e => console.error(e));
      };
      
      fetchHub();
      studyHubPolling = setInterval(fetchHub, 5000); // Short-polling every 5 seconds
    }

    container.innerHTML = `
      <!-- Switch Student Bar -->
      <div class="user-switch-bar" style="display: flex; justify-content: space-between; align-items: center;">
        <div class="workspace-header-text">
          <h2>Distraction-Free Student Study Vault</h2>
          <p>Student: <strong>${student.name} (${student.id})</strong> | Assigned Class: <strong>${student.stream}</strong></p>
        </div>
        <div class="gamification-widget" style="display: flex; gap: 16px; background: rgba(255,255,255,0.1); padding: 8px 16px; border-radius: 20px;">
          <div class="streak-flame-container" title="Daily Study Streak">
            <svg class="living-flame" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C12 2 7 7 7 12C7 14.7614 9.23858 17 12 17C14.7614 17 17 14.7614 17 12C17 9 14 7 14 7C14 7 16 9 16 12C16 14.2091 14.2091 16 12 16C9.79086 16 8 14.2091 8 12C8 8.5 12 4 12 4Z" fill="#FFA500"/>
              <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.5 12 2 12 2C12 2 2 6.5 2 12C2 17.5228 6.47715 22 12 22ZM12 20C7.58172 20 4 16.4183 4 12C4 7.5 12 4.5 12 4.5C12 4.5 20 7.5 20 12C20 16.4183 16.4183 20 12 20Z" fill="url(#flameGradient)"/>
              <defs>
                <linearGradient id="flameGradient" x1="12" y1="2" x2="12" y2="22" gradientUnits="userSpaceOnUse">
                  <stop stop-color="#FFD700"/>
                  <stop offset="1" stop-color="#FF4500"/>
                </linearGradient>
              </defs>
            </svg>
            <div style="display:flex; flex-direction:column; align-items:flex-start;">
              <strong style="color: var(--gold-light); font-size: 0.95rem; line-height: 1;"><span id="student-streak-display">${student.current_streak || 0}</span> Day Streak</strong>
            </div>
          </div>
          <div style="text-align: center; display:flex; align-items:center; gap:6px; background: rgba(255, 255, 255, 0.1); border-radius: 20px; padding: 4px 12px;" title="Total Experience Points">
            <span style="font-size: 1.2rem;">⭐</span>
            <strong style="color: #fff; font-size: 0.9rem;"><span id="student-xp-display">${student.xp_points || 0}</span> XP</strong>
          </div>
        </div>
      </div>

      <div class="student-layout">
        
        <!-- Left Panel: Notes Library & Reader -->
        <div>
          <section class="card" style="margin-bottom: 24px;">
            <h3 class="card-title" style="margin-bottom:12px;">Subject Study Handouts</h3>
            <div class="notes-list">
              ${studentMaterials.map(m => `
                <div class="note-card-item ${m.id === material!.id ? 'active' : ''}" data-mat-id="${m.id}">
                  <div class="note-card-meta">
                    <h4>${m.title}</h4>
                    <p>Subject: ${m.subject} | Uploaded by: ${m.author}</p>
                  </div>
                </div>
              `).join('')}
              ${studentMaterials.length === 0 ? '<p style="font-size:0.9rem; color:var(--text-light); text-align:center; padding:12px 0;">No handouts uploaded for your stream yet.</p>' : ''}
            </div>
          </section>

          <!-- Document Reader Display -->
          <section class="reader-panel">
            <div class="reader-header">
              <h3 class="reader-title">${material.title}</h3>
              <button class="btn-secondary" id="btn-read-aloud" style="padding: 6px 12px; font-size: 0.8rem; display:flex; align-items:center; gap:6px;">
                ${isTtsActive ? 'Stop Audio' : 'Read Aloud'}
              </button>
            </div>
            <div class="reader-body">
              ${renderParsedMarkdown(material.content)}
            </div>
          </section>
        </div>

        <!-- Right Panel: Charlie AI Tutor & Interactive Quizzes -->
        <div style="display:flex; flex-direction:column; gap:24px;">
          
          <!-- Charlie Chat Hub -->
          <section class="ai-tutor-container">
            <div class="ai-tutor-header">
              <div class="ai-avatar ${isGeneratingChat ? 'thinking' : ''} ${isTtsActive ? 'speaking' : ''}">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM15.5 9.5C16.33 9.5 17 10.17 17 11C17 11.83 16.33 12.5 15.5 12.5C14.67 12.5 14 11.83 14 11C14 10.17 14.67 9.5 15.5 9.5ZM8.5 9.5C9.33 9.5 10 10.17 10 11C10 11.83 9.33 12.5 8.5 12.5C7.67 12.5 7 11.83 7 11C7 10.17 7.67 9.5 8.5 9.5ZM12 17.5C9.67 17.5 7.68 16.04 6.8 14H17.2C16.32 16.04 14.33 17.5 12 17.5Z" fill="white"/>
                </svg>
              </div>
              <div class="ai-header-text">
                <h3>Charlie AI Companion</h3>
                <p><span class="online-dot"></span> Active & Ready</p>
              </div>
            </div>
            
            <div class="ai-chat-area" id="charlie-chat-log">
              ${chatHistory[chatKey].map((msg, index) => `
                <div class="chat-bubble ${msg.sender}">
                  ${renderParsedMarkdown(msg.text)}
                  ${msg.sender === 'assistant' ? `
                    <div class="chat-tts-icon" data-msg-idx="${index}" title="Listen to response">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M3 9V15H7L12 20V4L7 9H3ZM16.5 12C16.5 10.23 15.48 8.71 14 7.97V16.02C15.48 15.29 16.5 13.77 16.5 12ZM14 3.23V5.29C16.89 6.15 19 8.83 19 12C19 15.17 16.89 17.85 14 18.71V20.77C18.01 19.86 21 16.28 21 12C21 7.72 18.01 4.14 14 3.23Z"/></svg>
                    </div>` : ''}
                </div>
              `).join('')}
              ${isGeneratingChat ? `
                <div class="chat-bubble assistant" id="chat-typing-indicator" style="max-width: 60px;">
                  <div class="typing-indicator">
                    <div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>
                  </div>
                </div>
              ` : ''}
            </div>

            <!-- Chat inputs -->
            <div class="chat-input-bar">
              <button class="chat-btn-circle chat-mic-btn ${isVoiceModeActive ? 'recording' : ''}" id="btn-voice-mode" title="Toggle Hands-Free Voice Mode">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14C13.66 14 15 12.66 15 11V5C15 3.34 13.66 2 12 2C10.34 2 9 3.34 9 5V11C9 12.66 10.34 14 12 14ZM17 11C17 13.76 14.76 16 12 16C9.24 16 7 13.76 7 11H5C5 14.53 7.61 17.43 11 17.92V21H13V17.92C16.39 17.43 19 14.53 19 11H17Z"/></svg>
              </button>
              <input type="text" id="chat-text-input" class="chat-input-pill" placeholder="Ask Charlie a question...">
              <button class="chat-btn-circle chat-btn-send" id="btn-chat-send" title="Send message">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
              </button>
            </div>
          </section>

          <!-- Interactive Practice Quiz -->
          <section class="card">
            <h3 class="card-title" style="margin-bottom:12px;">Practice Quiz</h3>
            <div id="quiz-box-container">
              ${renderQuizBox(material, student)}
            </div>
          </section>

          <!-- AI-Moderated Collaborative Study Hub -->
          <section class="card study-hub-panel">
            <h3 class="card-title" style="margin-bottom:12px;">Collaborative Study Hub (${student.stream})</h3>
            <div class="hub-chat-log" id="study-hub-log" style="height: 250px; overflow-y: auto; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin-bottom: 12px;">
              ${studyHubMessages.length === 0 ? '<p style="text-align:center; color:var(--text-light); font-size:0.85rem; margin-top:20px;">No messages yet. Be the first to start the discussion!</p>' : ''}
              ${studyHubMessages.map(msg => `
                <div style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid rgba(0,0,0,0.05);">
                  <strong style="color: ${msg.sender_role === 'teacher' || msg.sender_role === 'ai' ? 'var(--gold-dark)' : 'var(--primary)'}; font-size: 0.85rem;">
                    ${msg.sender_name} ${msg.sender_role === 'ai' ? '🤖' : ''}
                  </strong>
                  <p style="font-size: 0.9rem; margin-top: 2px;">${renderParsedMarkdown(msg.message)}</p>
                </div>
              `).join('')}
            </div>
            <div class="chat-input-bar">
              <input type="text" id="hub-text-input" class="form-control" placeholder="Discuss with classmates..." style="border-radius: 20px;">
              <button class="btn-primary" id="btn-hub-send" style="border-radius: 20px; padding: 10px 16px;">
                Send
              </button>
            </div>
          </section>
        </div>

      </div>
    `;

    // Scroll chat to bottom
    const chatLog = container.querySelector('#charlie-chat-log');
    if (chatLog) chatLog.scrollTop = chatLog.scrollHeight;

    // Bind Event Handlers
    bindStudentEvents(container, allStudents, studentMaterials);
  } catch (err: any) {
    console.error('Error loading student portal:', err);
    container.innerHTML = `
      <div style="padding: 24px; text-align:center;">
        <h3 style="color: var(--crimson);">Study Vault Synchronize Error</h3>
        <p style="color: var(--text-light); margin-top: 8px;">Failed to load study materials: ${err.message}</p>
        <button class="btn-primary" onclick="window.location.reload()" style="margin-top: 16px; margin-inline: auto;">Retry Connection</button>
      </div>
    `;
  }
}

function renderParsedMarkdown(content: string): string {
  let html = content
    .replace(/### (.*?)\n/g, '<h3 style="color:var(--primary); font-size:1.1rem; margin-top:16px; margin-bottom:8px;">$1</h3>')
    .replace(/#### (.*?)\n/g, '<h4 style="color:var(--primary-light); font-size:0.95rem; margin-top:12px; margin-bottom:6px;">$1</h4>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\[IMAGE:(.*?)\]/gi, (_match, p1) => {
      const id = 'img-' + Math.random().toString(36).substr(2, 9);
      return `<div id="${id}" class="ai-image-placeholder" data-prompt="${p1}" style="width:100%; min-height:200px; border-radius:8px; background:var(--bg-light); display:flex; align-items:center; justify-content:center; flex-direction:column; border:1px dashed var(--border); margin:12px 0;">
        <div class="online-dot" style="display:inline-block; width:12px; height:12px; animation: pulse 1s infinite;"></div>
        <p style="font-size:0.8rem; color:var(--text-light); margin-top:8px;">Charlie is painting: ${p1}</p>
      </div>`;
    })
    .replace(/\[AR:(.*?)\]/gi, (_match, p1) => {
      // Use Astronaut for space-related queries, Robot for others as generic placeholders
      const glbSrc = p1.toLowerCase().includes('astronaut') || p1.toLowerCase().includes('space') 
        ? 'https://modelviewer.dev/shared-assets/models/Astronaut.glb'
        : 'https://modelviewer.dev/shared-assets/models/RobotExpressive.glb';
      return `<model-viewer src="${glbSrc}" alt="3D AR Model of ${p1}" auto-rotate camera-controls ar shadow-intensity="1" style="width: 100%; height: 350px; border-radius: 8px; background: linear-gradient(135deg, #f5f7fa 0%, #e4e8eb 100%); margin-top:8px; margin-bottom:8px; border: 1px solid var(--border); box-shadow: inset 0 2px 4px rgba(0,0,0,0.05);"></model-viewer>`;
    })
    .replace(/- (.*?)\n/g, '<li style="margin-left: 12px; font-size: 0.9rem; list-style-type:square;">$1</li>');
    
  return html.split('\n\n').map(p => p.trim().startsWith('<h') || p.trim().startsWith('<li') ? p : `<p style="margin-bottom:12px; font-size:0.9rem;">${p}</p>`).join('');
}

function renderQuizBox(material: StudyMaterial, student: any): string {
  if (isGeneratingQuiz) {
    return `
      <div style="text-align:center; padding: 24px;">
        <div class="online-dot" style="display:inline-block; width:12px; height:12px; animation: pulse 1s infinite;"></div>
        <p style="font-size:0.9rem; color:var(--text-light); margin-top:8px;">Charlie is analyzing the study material and generating an adaptive quiz for you...</p>
      </div>
    `;
  }

  if (quizQuestions.length === 0) {
    return `<p style="font-size:0.85rem; color:var(--text-light);">No quiz questions generated for "${material.title}".</p>`;
  }
  
  if (currentQuizIdx >= quizQuestions.length) {
    return `
      <div style="text-align:center; padding:16px;">
        <h4 style="margin:0; font-size:1.1rem; color:var(--primary);">Quiz Completed, ${student.name}!</h4>
        <p style="font-size:0.9rem; color:var(--text-light); margin-top:4px;">You scored <strong>${quizScore} / ${quizQuestions.length}</strong> marks.</p>
        <button class="btn-primary" id="btn-restart-quiz" style="margin-top:12px; margin-inline:auto;">Try Again</button>
      </div>
    `;
  }
  
  const q = quizQuestions[currentQuizIdx];
  
  return `
    <div class="quiz-box">
      <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-light); margin-bottom:8px;">
        <span>Question ${currentQuizIdx + 1} of ${quizQuestions.length}</span>
        <span>Score: ${quizScore}</span>
      </div>
      <h4 style="font-size:0.95rem; color:var(--primary-dark); font-weight:600; margin-bottom:12px;">${q.question}</h4>
      
      <div style="display:flex; flex-direction:column; gap:8px;">
        ${q.options.map((opt, idx) => {
          let btnClass = 'quiz-option';
          if (answeredIdx !== null) {
            if (idx === q.correctIndex) btnClass += ' correct';
            else if (idx === answeredIdx) btnClass += ' incorrect';
          }
          return `<button class="${btnClass}" data-opt-idx="${idx}" ${answeredIdx !== null ? 'disabled' : ''}>${opt}</button>`;
        }).join('')}
      </div>

      ${answeredIdx !== null ? `
        <div style="margin-top:12px; padding:10px; background:#FFFFFF; border:1px dashed var(--border); border-radius:8px; font-size:0.8rem; line-color:var(--text);">
          <strong>Explanation:</strong> ${q.explanation}
          <button class="btn-accent" id="btn-next-quiz" style="width:100%; margin-top:12px; padding:6px; font-size:0.8rem;">
            ${currentQuizIdx === quizQuestions.length - 1 ? 'Finish Quiz' : 'Next Question'}
          </button>
        </div>
      ` : ''}
    </div>
  `;
}

function resetQuizState(): void {
  currentQuizIdx = 0;
  quizScore = 0;
  answeredIdx = null;
}

function bindStudentEvents(container: HTMLElement, allStudents: any[], studentMaterials: StudyMaterial[]): void {
  // Only process dynamic AI image placeholders when Charlie has completely finished streaming his response
  if (!isGeneratingChat) {
    processImagePlaceholders(container);
  }

  // Select active Student
  const select = container.querySelector('#student-select') as HTMLSelectElement;
  select?.addEventListener('change', () => {
    activeStudentId = select.value;
    const db = getDb();
    db.activeStudentId = activeStudentId;
    saveDb(db);
    
    // Stop any speaking and reset quiz
    stopSpeaking();
    isTtsActive = false;
    resetQuizState();
    
    // Clear cached data so next render fetches fresh materials for new student's stream
    cachedStudents = null;
    cachedMaterials = null;
    
    renderStudentPortal(container);
  });

  // Select study handout card
  const cards = container.querySelectorAll('.note-card-item');
  cards.forEach(card => {
    card.addEventListener('click', (e) => {
      const matId = (e.currentTarget as HTMLElement).dataset.matId;
      if (matId) {
        activeMaterialId = matId;
        const db = getDb();
        db.activeMaterialId = activeMaterialId;
        saveDb(db);
        
        // Stop speech & reset quiz
        stopSpeaking();
        isTtsActive = false;
        
        const selectedMat = studentMaterials.find(m => m.id === matId);
        if (selectedMat) {
          quizQuestions = getQuizForMaterial(selectedMat);
          resetQuizState();
        }
        
        renderStudentPortal(container);
      }
    });
  });

  // Speak Text Button
  container.querySelector('#btn-read-aloud')?.addEventListener('click', () => {
    if (isTtsActive) {
      stopSpeaking();
      isTtsActive = false;
      renderStudentPortal(container);
    } else {
      const material = studentMaterials.find(m => m.id === activeMaterialId);
      const student = allStudents.find(s => s.id === activeStudentId) || allStudents[0];
      if (material && student) {
        isTtsActive = true;
        renderStudentPortal(container);
        
        speakText(material.content, () => {
          isTtsActive = false;
          renderStudentPortal(container);
        }, student.stream);
      }
    }
  });

  // Chat send action
  const chatInput = container.querySelector('#chat-text-input') as HTMLInputElement;
  const chatSendBtn = container.querySelector('#btn-chat-send');
  
  const submitChat = async () => {
    if (!chatInput || chatInput.value.trim() === '') return;
    
    const query = chatInput.value.trim();
    chatInput.value = '';
    
    const student = allStudents.find(s => s.id === activeStudentId) || allStudents[0];
    const material = studentMaterials.find(m => m.id === activeMaterialId) || studentMaterials[0];
    
    const chatKey = `${student.id}_${material.id}`;
    
    // Push user message
    chatHistory[chatKey].push({ sender: 'user', text: query });
    
    // Create empty assistant message for streaming
    const assistantMsgIndex = chatHistory[chatKey].push({ sender: 'assistant', text: '' }) - 1;
    isGeneratingChat = true;
    renderStudentPortal(container);
    
    // Generate AI tutor response (streamed)
    const reply = await generateAiResponse(query, material, student, (chunkText) => {
      chatHistory[chatKey][assistantMsgIndex].text = chunkText;
      renderStudentPortal(container);
    });
    
    isGeneratingChat = false;
    chatHistory[chatKey][assistantMsgIndex].text = reply;
    
    // Opt-In UX: Voice auto-play removed to prevent cognitive overload.
    // Students must click the 'Listen' icon manually.
    
    renderStudentPortal(container);
  };
  
  chatSendBtn?.addEventListener('click', submitChat);
  chatInput?.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') submitChat();
  });

  // Speak response from chat histories
  const speakChimeIcons = container.querySelectorAll('.chat-tts-icon');
  speakChimeIcons.forEach(icon => {
    icon.addEventListener('click', (e) => {
      e.stopPropagation();
      const student = allStudents.find(s => s.id === activeStudentId) || allStudents[0];
      const material = studentMaterials.find(m => m.id === activeMaterialId) || studentMaterials[0];
      const chatKey = `${student.id}_${material.id}`;
      const msgIdx = parseInt((e.currentTarget as HTMLElement).dataset.msgIdx || '0');
      
      const text = chatHistory[chatKey][msgIdx]?.text;
      if (text) {
        speakText(text, undefined, student.stream);
      }
    });
  });

  // Voice Mode Toggle
  const voiceBtn = container.querySelector('#btn-voice-mode');
  voiceBtn?.addEventListener('click', () => {
    toggleVoiceMode(container, allStudents, studentMaterials);
  });

  // Quiz Option Click
  const quizOptions = container.querySelectorAll('.quiz-option');
  quizOptions.forEach(opt => {
    opt.addEventListener('click', (e) => {
      const idx = parseInt((e.currentTarget as HTMLElement).dataset.optIdx || '0');
      answeredIdx = idx;
      
      const q = quizQuestions[currentQuizIdx];
      if (idx === q.correctIndex) {
        quizScore++;
        triggerToastNotification('Correct Answer', 'Well done! You got it right.');
      } else {
        triggerHapticVibration([50, 50]);
        triggerToastNotification('Incorrect Answer', 'Not quite, check the explanation below.', 'danger');
      }
      
      renderStudentPortal(container);
    });
  });

  // Next Quiz question
  container.querySelector('#btn-next-quiz')?.addEventListener('click', async () => {
    currentQuizIdx++;
    answeredIdx = null;
    
    // Check if quiz is completed
    if (currentQuizIdx >= quizQuestions.length) {
      triggerToastNotification('Quiz Completed!', 'Calculating XP points...', 'info');
      try {
        const xpReward = quizScore * 10; // 10 XP per correct answer
        if (xpReward > 0) {
          const res = await apiClient.post(`/students/${activeStudentId}/xp`, { xp: xpReward }) as any;
          
          // Update local state instantly so UI header updates
          const student = allStudents.find(s => s.id === activeStudentId);
          if (student) {
            student.xp_points = res.xp;
            student.current_streak = res.streak;
          }
          triggerToastNotification('XP Awarded', `You earned ${xpReward} XP!`, 'info');
        }
      } catch (e) {
        console.error('Failed to award XP', e);
      }
    }
    
    renderStudentPortal(container);
  });

  // Study Hub Send
  const hubInput = container.querySelector('#hub-text-input') as HTMLInputElement;
  const hubSendBtn = container.querySelector('#btn-hub-send');
  
  const submitHubMessage = async () => {
    const text = hubInput?.value.trim();
    if (!text) return;
    
    const student = allStudents.find(s => s.id === activeStudentId) || allStudents[0];
    
    // Optimistic UI update
    studyHubMessages.push({
      sender_name: student.name,
      sender_role: 'student',
      message: text
    });
    hubInput.value = '';
    renderStudentPortal(container);
    
    try {
      await apiClient.post(`/students/study-hub/${encodeURIComponent(student.stream)}`, {
        sender_name: student.name,
        sender_role: 'student',
        message: text
      });
      
      // Basic AI Moderation: If question asked, Charlie answers in the hub
      if (text.includes('?')) {
        const material = studentMaterials.find(m => m.id === activeMaterialId) || studentMaterials[0];
        const aiResponse = await generateAiResponse(`A student asked this in the Study Hub: "${text}". Give a short helpful answer to the whole class.`, material, student);
        
        await apiClient.post(`/students/study-hub/${encodeURIComponent(student.stream)}`, {
          sender_name: 'Charlie AI Tutor',
          sender_role: 'ai',
          message: aiResponse
        });
        
        // Let polling catch the AI response, but trigger toast
        triggerToastNotification('Study Hub', 'Charlie AI replied to your question!', 'info');
      }
    } catch (e) {
      console.error('Failed to post to hub', e);
    }
  };
  
  hubSendBtn?.addEventListener('click', submitHubMessage);
  hubInput?.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') submitHubMessage();
  });

  // Restart Quiz
  container.querySelector('#btn-restart-quiz')?.addEventListener('click', () => {
    resetQuizState();
    renderStudentPortal(container);
  });
}

function toggleVoiceMode(container: HTMLElement, allStudents: any[], studentMaterials: StudyMaterial[]): void {
  if (isVoiceModeActive) {
    // Turn off
    isVoiceModeActive = false;
    if (recognitionInstance) {
      recognitionInstance.stop();
      recognitionInstance = null;
    }
    stopSpeaking();
    renderStudentPortal(container);
    triggerToastNotification('Voice Mode', 'Hands-free voice mode disabled.', 'info');
    return;
  }

  // Turn on
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRecognition) {
    triggerToastNotification('Error', 'Voice Mode is not supported in this browser.', 'danger');
    return;
  }

  isVoiceModeActive = true;
  recognitionInstance = new SpeechRecognition();
  recognitionInstance.continuous = true;
  recognitionInstance.interimResults = false;
  recognitionInstance.lang = 'en-US';

  recognitionInstance.onstart = () => {
    triggerHapticVibration([50]);
    triggerToastNotification('Voice Mode Active', 'Charlie is listening. Speak your question naturally.', 'info');
  };

  recognitionInstance.onresult = async (event: any) => {
    // Only process the latest final result
    const lastResultIdx = event.results.length - 1;
    if (event.results[lastResultIdx].isFinal) {
      const transcript = event.results[lastResultIdx][0].transcript.trim();
      
      if (transcript.length > 2 && isVoiceModeActive) {
        // Pause listening while Charlie answers
        recognitionInstance.stop();
        
        const student = allStudents.find(s => s.id === activeStudentId) || allStudents[0];
        const material = studentMaterials.find(m => m.id === activeMaterialId) || studentMaterials[0];
        const chatKey = `${student.id}_${material.id}`;
        
        if (!chatHistory[chatKey]) chatHistory[chatKey] = [];
        chatHistory[chatKey].push({ sender: 'user', text: transcript });
        renderStudentPortal(container);

        try {
          // Create empty assistant message for streaming
          const assistantMsgIndex = chatHistory[chatKey].push({ sender: 'assistant', text: '' }) - 1;
          isGeneratingChat = true;
          renderStudentPortal(container);
          
          const reply = await generateAiResponse(transcript, material, student, (chunkText) => {
            chatHistory[chatKey][assistantMsgIndex].text = chunkText;
            renderStudentPortal(container);
          });
          
          isGeneratingChat = false;
          chatHistory[chatKey][assistantMsgIndex].text = reply;
          renderStudentPortal(container);
          
          // Speak it back, and resume listening when done
          isTtsActive = true;
          speakText(reply, () => {
            isTtsActive = false;
            if (isVoiceModeActive && recognitionInstance) {
              try { recognitionInstance.start(); } catch(e) {}
            }
          }, student.stream);
        } catch (e) {
          console.error(e);
          // Resume if failed
          if (isVoiceModeActive && recognitionInstance) {
             try { recognitionInstance.start(); } catch(err) {}
          }
        }
      }
    }
  };

  recognitionInstance.onerror = (event: any) => {
    console.warn('Speech Recognition error:', event.error);
    if (event.error === 'not-allowed') {
      isVoiceModeActive = false;
      renderStudentPortal(container);
      triggerToastNotification('Microphone Blocked', 'Please allow microphone access to use Voice Mode.', 'danger');
    }
  };

  recognitionInstance.onend = () => {
    // Auto restart if still active (e.g., timed out by browser) but not currently speaking
    if (isVoiceModeActive && !isTtsActive) {
      try {
        recognitionInstance.start();
      } catch (e) {
        // Already started
      }
    }
  };

  recognitionInstance.start();
  renderStudentPortal(container);
}

async function processImagePlaceholders(container: HTMLElement) {
  const placeholders = container.querySelectorAll('.ai-image-placeholder');
  placeholders.forEach(async (el) => {
    const prompt = (el as HTMLElement).dataset.prompt;
    if (!prompt) return;
    
    // Mark as processing to avoid duplicate requests
    (el as HTMLElement).classList.remove('ai-image-placeholder');
    (el as HTMLElement).classList.add('ai-image-processing');
    
    try {
      const { apiClient } = await import('../data/apiClient');
      const res: any = await apiClient.post('/ai/generate-image', { prompt });
      
      const img = document.createElement('img');
      img.alt = prompt;
      img.style.maxWidth = '100%';
      img.style.borderRadius = '8px';
      img.style.marginTop = '8px';
      img.style.marginBottom = '8px';
      img.style.display = 'block';
      
      const handleError = () => {
        const fallback = document.createElement('div');
        fallback.style.padding = '40px 20px';
        fallback.style.borderRadius = '12px';
        fallback.style.background = '#f8fafc';
        fallback.style.textAlign = 'center';
        fallback.style.border = '1px dashed #cbd5e1';
        fallback.style.margin = '12px 0';
        fallback.innerHTML = '<div style="font-size:2rem; margin-bottom:8px;">🖼️</div><p style="font-size:0.85rem; color:#64748b; margin:0;">Image generation temporarily unavailable.</p>';
        if (img.parentNode) {
          img.parentNode.replaceChild(fallback, img);
        } else if (el.parentNode) {
           el.parentNode.replaceChild(fallback, el);
        }
      };
      
      img.onerror = handleError;
      
      if (res.base64) {
        img.src = `data:image/png;base64,${res.base64}`;
        el.replaceWith(img);
      } else if (res.url) {
        img.src = res.url;
        el.replaceWith(img);
      } else {
        handleError();
      }
    } catch (err) {
      const fallback = document.createElement('div');
      fallback.style.padding = '40px 20px';
      fallback.style.borderRadius = '12px';
      fallback.style.background = '#f8fafc';
      fallback.style.textAlign = 'center';
      fallback.style.border = '1px dashed #cbd5e1';
      fallback.style.margin = '12px 0';
      fallback.innerHTML = '<div style="font-size:2rem; margin-bottom:8px;">🖼️</div><p style="font-size:0.85rem; color:#64748b; margin:0;">Image generation failed.</p>';
      el.replaceWith(fallback);
    }
  });
}
