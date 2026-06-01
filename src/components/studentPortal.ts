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
let isRecording = false;
let recognition: any = null;

// Quiz State
let quizQuestions: QuizQuestion[] = [];
let currentQuizIdx = 0;
let quizScore = 0;
let answeredIdx: number | null = null;

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
        <div class="user-switch-bar">
          <div class="workspace-header-text">
            <h2>Distraction-Free Student Study Vault</h2>
            <p>Student: <strong>${student.name} (${student.id})</strong> | Assigned Class: <strong>${student.stream}</strong></p>
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
    
    // Load quiz details if not loaded for this material
    if (quizQuestions.length === 0) {
      quizQuestions = getQuizForMaterial(material);
      resetQuizState();
    }

    container.innerHTML = `
      <!-- Switch Student Bar -->
      <div class="user-switch-bar">
        <div class="workspace-header-text">
          <h2>Distraction-Free Student Study Vault</h2>
          <p>Student: <strong>${student.name} (${student.id})</strong> | Assigned Class: <strong>${student.stream}</strong></p>
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
              <div class="ai-avatar" style="font-weight: bold; background: var(--crimson); color: white; display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%;">AI</div>
              <div class="ai-header-text">
                <h3>Charlie AI Companion</h3>
                <p><span class="online-dot"></span> Ready to teach you</p>
              </div>
            </div>
            
            <div class="ai-chat-area" id="charlie-chat-log">
              ${chatHistory[chatKey].map((msg, index) => `
                <div class="chat-bubble ${msg.sender}">
                  ${renderParsedMarkdown(msg.text)}
                  ${msg.sender === 'assistant' ? `<span class="chat-tts-icon" data-msg-idx="${index}" title="Listen to response" style="cursor: pointer; opacity: 0.6; font-size: 0.75rem; margin-top: 4px; display: inline-block; border: 1px solid var(--border); padding: 2px 6px; border-radius: 4px; background: white;">Listen</span>` : ''}
                </div>
              `).join('')}
            </div>

            <!-- Chat inputs -->
            <div class="chat-input-bar">
              <!-- Speech recognition microphone -->
              <button class="chat-mic-btn ${isRecording ? 'recording' : ''}" id="btn-mic-dictation" title="Speak into microphone" style="font-size: 0.8rem; font-weight: 500;">
                Speak
              </button>
              <input type="text" id="chat-text-input" class="form-control" placeholder="Ask Charlie a question about the notes..." style="border-radius: 20px;">
              <button class="btn-primary" id="btn-chat-send" style="border-radius: 20px; padding: 10px 16px;">
                Send
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
    .replace(/- (.*?)\n/g, '<li style="margin-left: 12px; font-size: 0.9rem; list-style-type:square;">$1</li>');
    
  return html.split('\n\n').map(p => p.trim().startsWith('<h') || p.trim().startsWith('<li') ? p : `<p style="margin-bottom:12px; font-size:0.9rem;">${p}</p>`).join('');
}

function renderQuizBox(material: StudyMaterial, student: any): string {
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
      if (material) {
        isTtsActive = true;
        renderStudentPortal(container);
        
        speakText(material.content, () => {
          isTtsActive = false;
          renderStudentPortal(container);
        });
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
    renderStudentPortal(container);
    
    // Generate AI tutor response (client-side simulation)
    const reply = await generateAiResponse(query, material, student);
    chatHistory[chatKey].push({ sender: 'assistant', text: reply });
    
    // Auto speak response
    speakText(reply);
    
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
        speakText(text);
      }
    });
  });

  // Mic dictation voice recognition
  const micBtn = container.querySelector('#btn-mic-dictation');
  micBtn?.addEventListener('click', () => {
    if (isRecording) {
      stopDictation();
    } else {
      startDictation(chatInput, container);
    }
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
  container.querySelector('#btn-next-quiz')?.addEventListener('click', () => {
    currentQuizIdx++;
    answeredIdx = null;
    renderStudentPortal(container);
  });

  // Restart Quiz
  container.querySelector('#btn-restart-quiz')?.addEventListener('click', () => {
    resetQuizState();
    renderStudentPortal(container);
  });
}

function startDictation(inputEl: HTMLInputElement, container: HTMLElement): void {
  const Speech = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!Speech) {
    triggerToastNotification('Dictation Error', 'Speech recognition is not supported in this browser.', 'danger');
    return;
  }

  try {
    recognition = new Speech();
    recognition.continuous = false;
    recognition.lang = 'en-KE';
    recognition.interimResults = false;

    recognition.onstart = () => {
      isRecording = true;
      triggerHapticVibration([50]);
      renderStudentPortal(container);
    };

    recognition.onresult = (event: any) => {
      const text = event.results[0][0].transcript;
      if (inputEl) {
        inputEl.value = text;
      }
      stopDictation();
      setTimeout(() => {
        container.querySelector('#btn-chat-send')?.dispatchEvent(new Event('click'));
      }, 500);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      stopDictation();
      renderStudentPortal(container);
    };

    recognition.onend = () => {
      isRecording = false;
      renderStudentPortal(container);
    };

    recognition.start();
  } catch (err) {
    console.error('Speech recognition init failed:', err);
    isRecording = false;
    renderStudentPortal(container);
  }
}

function stopDictation(): void {
  if (recognition) {
    recognition.stop();
    recognition = null;
  }
  isRecording = false;
}
