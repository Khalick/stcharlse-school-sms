let audioCtx: AudioContext | null = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
}

/**
 * Synthesizes a high-fidelity school bell ring using the Web Audio API.
 */
export function playSchoolBell(): void {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    
    const now = ctx.currentTime;
    
    // Play multiple overlapping oscillators to simulate a metallic bell clang
    const frequencies = [440, 554.37, 659.25, 880];
    
    frequencies.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      
      // School bell ring pattern (vibrato)
      osc.frequency.linearRampToValueAtTime(freq + 5, now + 0.1);
      osc.frequency.linearRampToValueAtTime(freq - 5, now + 0.2);
      osc.frequency.linearRampToValueAtTime(freq + 5, now + 0.3);
      osc.frequency.linearRampToValueAtTime(freq - 5, now + 0.4);
      osc.frequency.linearRampToValueAtTime(freq, now + 0.5);

      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.15, now + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);
      
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      osc.start(now);
      osc.stop(now + 2);
    });

    triggerHapticVibration();
  } catch (err) {
    console.warn('Web Audio API not supported or blocked:', err);
  }
}

/**
 * Synthesizes a gentle warning double-chime for text alerts or late register warnings.
 */
export function playWarningChime(): void {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    
    const now = ctx.currentTime;
    
    // Tone 1
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.frequency.setValueAtTime(880, now); // A5
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.1, now + 0.05);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.3);
    
    // Tone 2 (pitched up)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.frequency.setValueAtTime(1046.50, now + 0.15); // C6
    gain2.gain.setValueAtTime(0, now + 0.15);
    gain2.gain.linearRampToValueAtTime(0.1, now + 0.2);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.6);

    triggerHapticVibration([50, 50, 100]);
  } catch (err) {
    console.warn('Web Audio API blocked or not supported:', err);
  }
}

/**
 * Invokes device-level haptic vibration if supported.
 */
export function triggerHapticVibration(pattern: number[] = [100, 50, 100]): void {
  if ('vibrate' in navigator) {
    navigator.vibrate(pattern);
  }
  
  // Screen shake representation
  const mainWrapper = document.getElementById('app');
  if (mainWrapper) {
    mainWrapper.classList.add('shake-device');
    setTimeout(() => {
      mainWrapper.classList.remove('shake-device');
    }, 500);
  }
}

/**
 * Synthesizes speech using Web Speech API for Charlie AI Tutor.
 */
let currentUtterance: SpeechSynthesisUtterance | null = null;

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  // Pre-load voices to avoid async empty array bugs on first TTS call
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices();
  };
  window.speechSynthesis.getVoices();
}

export function speakText(text: string, onEnd?: () => void, studentStream?: string): void {
  try {
    stopSpeaking();
    
    if (!('speechSynthesis' in window)) {
      console.warn('Speech synthesis not supported in this browser.');
      if (onEnd) onEnd();
      return;
    }
    
    // Clean markdown formatting and strip out image URLs so Charlie doesn't read the image code aloud
    const cleanText = text
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/\[.*?\]\(.*?\)/g, '')
      .replace(/[*#`_\-]/g, '');
    
    currentUtterance = new SpeechSynthesisUtterance(cleanText);
    
    // Target a high-quality "documentary / AI Advert" male voice
    const voices = window.speechSynthesis.getVoices();
    
    // Priority list of highly natural, premium voices (Harvard/Stanford recommended for Brain Acceptance Frequency)
    const targetVoices = [
      'Google UK English Male', // Highly natural
      'Oliver', // iOS natural
      'Daniel', // macOS premium British male
      'Arthur', // Windows premium male
      'Microsoft Guy Online', // Premium Azure voice
      'Microsoft Christopher Online'
    ];

    let premiumMaleVoice = null;
    
    for (const target of targetVoices) {
      premiumMaleVoice = voices.find(v => v.name.includes(target));
      if (premiumMaleVoice) break;
    }

    // Fallback to any english male voice if specific targets aren't found
    if (!premiumMaleVoice) {
      premiumMaleVoice = voices.find(v => 
        (v.name.toLowerCase().includes('male') || v.name.toLowerCase().includes('boy') || v.name.toLowerCase().includes('guy')) && 
        v.lang.startsWith('en')
      );
    }
    
    // Ultimate fallback: Try to find ANY voice that doesn't scream "female" (like Samantha, Zira, Google US English)
    if (!premiumMaleVoice) {
      premiumMaleVoice = voices.find(v => 
        v.lang.startsWith('en') && 
        !v.name.toLowerCase().includes('samantha') && 
        !v.name.toLowerCase().includes('zira') &&
        !v.name.toLowerCase().includes('female')
      );
    }

    if (!premiumMaleVoice && voices.length > 0) {
      // If we still have nothing, just pick the first English voice available
      premiumMaleVoice = voices.find(v => v.lang.startsWith('en')) || voices[0];
    }

    if (premiumMaleVoice) {
      currentUtterance.voice = premiumMaleVoice;
    }
    // Psychological Voice Matrix based on student grade level
    let targetRate = 1.0;
    let targetPitch = 1.0;

    if (studentStream) {
      const lowerStream = studentStream.toLowerCase();
      if (lowerStream.includes('play group') || lowerStream.includes('pp1') || lowerStream.includes('pp2') || lowerStream.includes('grade 1') || lowerStream.includes('grade 2') || lowerStream.includes('grade 3')) {
        // Early Learners: Higher pitch, slower rate (Cheerful older sibling)
        targetRate = 0.85;
        targetPitch = 1.3;
      } else if (lowerStream.includes('grade 7') || lowerStream.includes('grade 8') || lowerStream.includes('grade 9')) {
        // Pre-teens / Junior High: Deeper, faster (Tech-savvy mentor)
        targetRate = 1.1;
        targetPitch = 0.9;
      } else if (lowerStream.includes('grade 6')) {
        // Grade 6 Specific: Brain Acceptance Frequency (Harvard/Stanford Cognitive Load Theory)
        targetRate = 0.95; // Slightly deliberate to reduce cognitive overload
        targetPitch = 1.0; // Perfect natural baseline
      } else {
        // Middle Primary (Grade 4-5): Warm, normal speed (Camp counselor)
        targetRate = 1.0;
        targetPitch = 1.1;
      }
    } else {
      // Default fallback
      targetRate = 1.0;
      targetPitch = 0.85; // Deeper, more authoritative male resonance
    }

    currentUtterance.rate = targetRate;
    currentUtterance.pitch = targetPitch;
    
    currentUtterance.onend = () => {
      currentUtterance = null;
      if (onEnd) onEnd();
    };
    
    currentUtterance.onerror = (e) => {
      console.error('Speech synthesis error:', e);
      currentUtterance = null;
      if (onEnd) onEnd();
    };
    
    window.speechSynthesis.speak(currentUtterance);
  } catch (err) {
    console.error('Speech Synthesis failed:', err);
    if (onEnd) onEnd();
  }
}

export function stopSpeaking(): void {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  currentUtterance = null;
}
