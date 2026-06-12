import { Router, type Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import crypto from 'crypto';
import { sql } from '../db.js';
import { authenticateToken, type AuthRequest } from '../middleware/auth.js';

// ─── Google Vision Service Account Auth (JWT + Token Cache) ─────────────────
let _visionTokenCache: { token: string; expires: number } | null = null;

async function getVisionAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (_visionTokenCache && _visionTokenCache.expires > now + 60) {
    return _visionTokenCache.token;
  }

  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!clientEmail || !rawKey) throw new Error('Google service account env vars missing.');

  const privateKey = rawKey.replace(/\\n/g, '\n');

  const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/cloud-vision',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  })).toString('base64url');

  const toSign = `${header}.${payload}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(toSign);
  const sig = signer.sign(privateKey, 'base64url');
  const jwt = `${toSign}.${sig}`;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Token exchange failed (${resp.status}): ${txt}`);
  }

  const data = await resp.json() as any;
  _visionTokenCache = { token: data.access_token, expires: now + (data.expires_in || 3600) };
  console.log('[Vision] 🔑 New access token obtained, valid for', data.expires_in, 'seconds.');
  return _visionTokenCache.token;
}

// ─── Smart Exam Mark Extractor ────────────────────────────────────────────────
function extractExamMark(rawText: string): number | null {
  if (!rawText || !rawText.trim()) return null;
  console.log('[OCR] Raw text from Vision API:', JSON.stringify(rawText));

  // Strategy 1: "TOTAL: 78" / "TOTAL 78" / "TOT: 78" / "SCORE: 78"
  const totalMatch = rawText.match(/(?:TOTAL|TOT|SCORE|MARKS?)\s*[:\-=]?\s*(\d{1,3})/i);
  if (totalMatch) {
    const n = parseInt(totalMatch[1], 10);
    if (n >= 0 && n <= 100) { console.log('[OCR] Found via TOTAL pattern:', n); return n; }
  }

  // Strategy 2: "78/100" or "78 / 100" — the mark before the slash
  const fractionMatch = rawText.match(/(\d{1,3})\s*\/\s*(100|80|60|50|40|30|20)/);
  if (fractionMatch) {
    const n = parseInt(fractionMatch[1], 10);
    if (n >= 0 && n <= 100) { console.log('[OCR] Found via fraction pattern:', n); return n; }
  }

  // Strategy 3: All standalone numbers in valid range — return the largest
  const nums = Array.from(rawText.matchAll(/(?<![./])\b(\d{1,3})\b(?![./])/g))
    .map(m => parseInt(m[1], 10))
    .filter(n => n >= 0 && n <= 100);

  if (nums.length === 1) { console.log('[OCR] Single number found:', nums[0]); return nums[0]; }
  if (nums.length > 1)   { const best = Math.max(...nums); console.log('[OCR] Multiple numbers, using max:', best, 'from', nums); return best; }

  console.warn('[OCR] No valid number found in text:', rawText);
  return null;
}

const upload = multer({ dest: '/tmp/' });
const router = Router();

// POST /api/ai/chat - Charlie AI student companion query endpoint
router.post('/chat', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  const { query, materialId } = req.body;

  if (!query) {
    res.status(400).json({ error: 'Missing chat query string.' });
    return;
  }

  try {
    const studentId = req.user?.id;
    if (!studentId) {
      res.status(401).json({ error: 'Unauthorized: Student ID missing from token.' });
      return;
    }

    // 1. Fetch student info
    const [student] = await sql`SELECT * FROM students WHERE id = ${studentId}`;
    if (!student) {
      res.status(404).json({ error: 'Student record not found.' });
      return;
    }

    // 2. Fetch study material context
    let materialContent = 'No specific handout is currently selected.';
    let materialTitle = 'General Learning';
    let materialSubject = 'General';

    if (materialId) {
      const [material] = await sql`SELECT * FROM study_materials WHERE id = ${materialId}`;
      if (material) {
        materialTitle = material.title;
        materialSubject = material.subject;
        materialContent = material.content || '';
      }
    }

    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'NVIDIA API key not configured on server.' });
      return;
    }

    // 3. Request Llama 3 via Groq
    const systemPrompt = `You are Charlie, the AI Study Companion for St. Charles School in Thika Kiganjo, Kenya. 
You are currently helping the student "${student.name}" (Grade: ${student.stream}) study "${materialTitle}" (Subject: ${materialSubject}).
Your answers MUST be strictly aligned with the Kenyan Primary School CBC Syllabus. 
Use very simple vocabulary, short sentences, and relatable analogies perfect for a primary school pupil. Do not rush or overcomplicate the answer.

CRITICAL INSTRUCTION: Be a general-purpose tutor! If the student asks an educational question about ANY topic (like science, digestion, space, history, etc.) that is completely unrelated to the current study material, YOU MUST STILL ANSWER IT HELPFULLY using your own knowledge. Never say "I can only talk about math" or refuse to answer. Encourage their curiosity!

CRITICAL LENGTH LIMIT: You must keep your response EXTREMELY short. Maximum 2 to 3 short sentences. If you talk too much, the audio system will crash. Be concise!

VISUAL LEARNING INTEGRATION (CRITICAL REQUIREMENT):
If the student asks about a physical object, organ, process, tool, or scene, YOU MUST show an educational image!
To do this, use the exact markdown tag: [IMAGE:topic]
Format EXACTLY like this:
I am showing you an image of [topic].
[IMAGE:highly detailed educational diagram of topic]

Example:
I am showing you an image of the digestive tract.
[IMAGE:highly detailed educational diagram of the human digestive tract organs kid-friendly]

AUGMENTED REALITY (AR) 3D MODELS:
If the student asks about space, astronauts, planets, robots, or cars, you MUST also show them an interactive 3D AR Model!
To do this, use the exact markdown tag: [AR:keyword]
Example:
[AR:astronaut] or [AR:robot]

DO NOT FORGET THE IMAGE OR AR MARKDOWN IF THE TOPIC IS VISUAL. Place the phrase and image at the very beginning of your response.

STUDY HANDOUT NOTES:
---------------------
${materialContent}
---------------------`;

    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'meta/llama-3.3-70b-instruct',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query }
        ],
        temperature: 0.6,
        max_tokens: 1024,
        stream: true
      })
    });

    if (!response.ok) {
      const errBody = await response.json();
      throw new Error(`NVIDIA API returned error status: ${response.status} - ${JSON.stringify(errBody)}`);
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim() !== '');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (dataStr === '[DONE]') {
              res.write('data: [DONE]\n\n');
              res.end();
              return;
            }
            try {
              const dataObj = JSON.parse(dataStr);
              const text = dataObj.choices?.[0]?.delta?.content || '';
              if (text) {
                res.write(`data: ${JSON.stringify({ text })}\n\n`);
              }
            } catch (e) {
              console.error('Error parsing SSE json', e);
            }
          }
        }
      }
    }
    
    res.end();
  } catch (error: any) {
    console.error('Charlie AI Chat API Error:', error);
    res.status(500).json({ error: 'Failed to query Charlie AI companion: ' + error.message });
  }
});

// POST /api/ai/parse-timetable - Parse uploaded schedule document or pasted text
router.post('/parse-timetable', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Access Denied: Only administrators can parse timetable documents.' });
    return;
  }

  const { text, imageBase64, mimeType } = req.body;

  if (!text && !imageBase64) {
    res.status(400).json({ error: 'Please paste schedule text or upload an image file.' });
    return;
  }

  try {
    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'NVIDIA API key not configured on server.' });
      return;
    }

    let model = 'meta/llama-3.3-70b-instruct';
    let messages: any[] = [];

    const systemPrompt = `You are a school schedule parser. Your job is to extract timetable sessions from the input text or image and return a JSON object with a single key "events" containing an array of timetable events.
Each event must contain:
- "day": string (e.g. "Monday", "Tuesday")
- "startTime": string in HH:MM format (e.g. "08:15", "10:30")
- "endTime": string in HH:MM format (e.g. "09:00", "11:15")
- "subject": string (e.g. "Science", "Mathematics", "Kiswahili", "English")
- "stream": string (Must match exactly one of: "Play Group Mourine", "Play Group Gachira", "Play Group Salome", "PP1 Munene", "PP1 Ann", "PP1 Fresha", "PP2 Carol", "PP2 Mary", "PP2 Triza", "Grade 1 East", "Grade 1 West", "Grade 1 North", "Grade 2 East", "Grade 2 West", "Grade 2 North", "Grade 3 East", "Grade 3 West", "Grade 3 North", "Grade 4 East", "Grade 4 West", "Grade 4 North", "Grade 4 South", "Grade 5 East", "Grade 5 West", "Grade 5 North", "Grade 5 South", "Grade 6 East", "Grade 6 West", "Grade 6 North", "Grade 7 Batian", "Grade 7 Lenana", "Grade 7 Nelion", "Grade 8 Lenana", "Grade 8 Batian", "Grade 9 Lenana", "Grade 9 Batian")
- "teacherName": string (e.g. "Agnes", "Mark", "Beatrice", "Neri")
- "room": string (e.g. "Room 4", "Room 5 (Workshop)")

Return ONLY a valid JSON object. Do not include markdown codeblocks or conversational filler.`;

    if (imageBase64) {
      model = 'meta/llama-3.2-11b-vision-instruct';
      messages = [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Parse the timetable sessions from this document image. Return valid JSON only.' },
            { type: 'image_url', image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${imageBase64}` } }
          ]
        }
      ];
    } else {
      messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Here is the timetable text to parse:\n\n${text}` }
      ];
    }

    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.1,
        max_tokens: 1024
      })
    });

    if (!response.ok) {
      const errBody = await response.json();
      throw new Error(`NVIDIA API returned error status: ${response.status} - ${JSON.stringify(errBody)}`);
    }

    const json = await response.json() as any;
    const rawContent = json.choices?.[0]?.message?.content || '{}';
    const parsedData = JSON.parse(rawContent.trim());
    const parsedEvents = parsedData.events || [];

    // Match parsed teacher names to existing PostgreSQL teachers
    const teachers = await sql`SELECT id, name FROM teachers`;

    const enrichedEvents = parsedEvents.map((ev: any) => {
      let matchedTeacherId: string | null = null;
      let matchedTeacherName: string | null = null;

      if (ev.teacherName) {
        const queryName = ev.teacherName.toLowerCase().trim();
        // Look for exact match or substring containment
        const match = teachers.find(t => 
          t.name.toLowerCase().includes(queryName) || 
          queryName.includes(t.name.toLowerCase())
        );

        if (match) {
          matchedTeacherId = match.id;
          matchedTeacherName = match.name;
        }
      }

      return {
        ...ev,
        resolvedTeacherId: matchedTeacherId,
        resolvedTeacherName: matchedTeacherName
      };
    });

    // Save the entire parsed schedule into the database for Cron notifications
    await sql`DELETE FROM timetable_events`;

    for (const ev of enrichedEvents) {
      if (!ev.stream || !ev.subject || !ev.day || !ev.startTime || !ev.endTime) continue;
      
      // Ensure class stream exists so foreign key constraints pass
      await sql`INSERT INTO classes (name) VALUES (${ev.stream}) ON CONFLICT (name) DO NOTHING`;

      await sql`
        INSERT INTO timetable_events (class_name, subject, teacher_id, day_of_week, start_time, end_time)
        VALUES (
          ${ev.stream}, 
          ${ev.subject}, 
          ${ev.resolvedTeacherId || null}, 
          ${ev.day}, 
          ${ev.startTime}, 
          ${ev.endTime}
        )
      `;
    }

    res.json({ events: enrichedEvents });
  } catch (error: any) {
    console.error('Groq Timetable Parsing Error:', error);
    res.status(500).json({ error: 'Llama 3 parser failed: ' + error.message });
  }
});

// POST /api/ai/transcribe - Transcribe audio using Groq Whisper API
router.post('/transcribe', authenticateToken, upload.single('audio'), async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: 'No audio file uploaded.' });
    return;
  }

  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Groq API key not configured on server.' });
      return;
    }

    const fileData = fs.readFileSync(req.file.path);
    const blob = new Blob([fileData], { type: req.file.mimetype || 'audio/webm' });
    
    const formData = new FormData();
    formData.append('file', blob, 'audio.webm');
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('response_format', 'json');

    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      body: formData
    });

    // Clean up temporary file
    fs.unlinkSync(req.file.path);

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(`Groq Whisper API error: ${response.status} - ${JSON.stringify(errBody)}`);
    }

    const json = await response.json() as any;
    res.json({ text: json.text });
  } catch (error: any) {
    console.error('Groq Whisper Transcription Error:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Transcription failed: ' + error.message });
  }
});

// POST /api/ai/generate-quiz - Adaptive AI Quiz Generation
router.post('/generate-quiz', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  const { materialId, stream } = req.body;

  if (!materialId || !stream) {
    res.status(400).json({ error: 'Missing materialId or stream.' });
    return;
  }

  try {
    const [material] = await sql`SELECT * FROM study_materials WHERE id = ${materialId}`;
    if (!material) {
      res.status(404).json({ error: 'Study material not found.' });
      return;
    }

    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'NVIDIA API key not configured.' });
      return;
    }

    const systemPrompt = `You are an expert exam setter for the Kenyan CBC Syllabus.
Based on the following study material, generate an adaptive multiple-choice quiz tailored to the reading level of a primary school student in "${stream}".
You MUST return a raw JSON array of 3 questions. Do NOT return markdown formatting like \`\`\`json. Return ONLY the JSON array.
Format EXACTLY like this:
[
  {
    "question": "What is the capital of Kenya?",
    "options": ["Nairobi", "Mombasa", "Kisumu", "Nakuru"],
    "correctIndex": 0,
    "explanation": "Nairobi is the capital city of Kenya, located in the central part of the country."
  }
]

STUDY MATERIAL:
${material.content}`;

    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'meta/llama-3.3-70b-instruct',
        messages: [{ role: 'system', content: systemPrompt }],
        temperature: 0.3,
        max_tokens: 1024
      })
    });

    if (!response.ok) {
      throw new Error(`NVIDIA API error: ${response.status}`);
    }

    const json = await response.json() as any;
    const answer = json.choices?.[0]?.message?.content || '[]';
    
    // Parse the JSON array string from Llama
    const questions = JSON.parse(answer.trim().replace(/^```json/, '').replace(/```$/, ''));
    res.json({ questions });
  } catch (error: any) {
    console.error('Quiz Generation Error:', error);
    res.status(500).json({ error: 'Failed to generate adaptive quiz.' });
  }
});

// POST /api/ai/generate-image - Generate high quality image via NVIDIA SDXL
router.post('/generate-image', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  const { prompt } = req.body;
  if (!prompt) {
    res.status(400).json({ error: 'Missing image prompt.' });
    return;
  }

  try {
    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'NVIDIA API key not configured.' });
      return;
    }

    const response = await fetch('https://ai.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-xl', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        text_prompts: [
          { text: prompt, weight: 1 },
          { text: "blurry, low quality, distorted, inappropriate", weight: -1 }
        ],
        cfg_scale: 5,
        sampler: "K_EULER_ANCESTRAL",
        steps: 25,
        seed: 0,
        samples: 1,
        style_preset: "photographic"
      })
    });

    if (!response.ok) {
      throw new Error(`NVIDIA SDXL API error: ${response.status}`);
    }

    const json = await response.json() as any;
    const base64Image = json.artifacts?.[0]?.base64 || '';
    res.json({ base64: base64Image });
  } catch (err: any) {
    console.warn('NVIDIA Image Gen Failed, falling back to Pollinations:', err.message);
    const encodedPrompt = encodeURIComponent(prompt + ' highly detailed educational diagram kid-friendly');
    const fallbackUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=800&height=400&nologo=true`;
    res.json({ base64: null, url: fallbackUrl });
  }
});

// POST /api/ai/scan
// Primary: NVIDIA Llama-3.2-11B-Vision (already configured, no billing)
// Fallback: Google Cloud Vision (requires billing enabled on GCP project)
router.post('/scan', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  const { imageBase64 } = req.body;
  if (!imageBase64) { res.status(400).json({ error: 'Missing imageBase64 data.' }); return; }

  const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
  const nvidiaKey   = process.env.NVIDIA_API_KEY;

  // ── PRIMARY: NVIDIA Llama-3.2-11B Vision ───────────────────────────────
  if (nvidiaKey) {
    try {
      console.log('[OCR] Trying NVIDIA Llama-3.2-11B-Vision...');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4500);

      const nvidiaResp = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${nvidiaKey}`
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: 'meta/llama-3.2-11b-vision-instruct',
          messages: [
            {
              role: 'system',
              content: 'You are a handwriting OCR assistant for a school exam system. Your ONLY job is to read the handwritten exam mark (a number between 0 and 100) from the image provided. Respond with ONLY the number — no words, no explanation, no units, no punctuation. If you see "78", respond "78". If you cannot read a number, respond "NONE".'
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'What is the handwritten exam mark in this image? Respond with the number only.'
                },
                {
                  type: 'image_url',
                  image_url: { url: `data:image/jpeg;base64,${cleanBase64}` }
                }
              ]
            }
          ],
          max_tokens: 10,
          temperature: 0,
          top_p: 1,
          stream: false
        })
      });
      clearTimeout(timeoutId);

      if (!nvidiaResp.ok) {
        const errTxt = await nvidiaResp.text();
        throw new Error(`NVIDIA API ${nvidiaResp.status}: ${errTxt}`);
      }

      const nvidiaJson = await nvidiaResp.json() as any;
      const rawAnswer  = (nvidiaJson.choices?.[0]?.message?.content || '').trim();
      console.log('[OCR] NVIDIA raw answer:', JSON.stringify(rawAnswer));

      if (rawAnswer && rawAnswer !== 'NONE') {
        const parsed = parseInt(rawAnswer.replace(/[^0-9]/g, ''), 10);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
          console.log('[OCR] ✅ NVIDIA detected mark:', parsed);
          res.json({ detectedMark: parsed, rawText: rawAnswer, engine: 'nvidia-llama-vision' });
          return;
        }
      }

      // Model said NONE or gave something unreadable
      console.log('[OCR] NVIDIA could not read a number. Mark null.');
      res.json({ detectedMark: null, rawText: rawAnswer, engine: 'nvidia-llama-vision' });
      return;

    } catch (nvidiaErr: any) {
      console.warn('[OCR] NVIDIA failed, trying Google Vision fallback:', nvidiaErr.message);
    }
  }

  // ── FALLBACK: Google Cloud Vision ──────────────────────────────────────
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey  = process.env.GOOGLE_PRIVATE_KEY;

  if (clientEmail && privateKey) {
    try {
      const accessToken = await getVisionAccessToken();
      const visionResp  = await fetch('https://vision.googleapis.com/v1/images:annotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({
          requests: [{
            image: { content: cleanBase64 },
            features: [{ type: 'TEXT_DETECTION', maxResults: 20 }],
            imageContext: { languageHints: ['en-t-i0-handwrit', 'en'] }
          }]
        })
      });
      if (!visionResp.ok) {
        const errTxt = await visionResp.text();
        throw new Error(`Vision API ${visionResp.status}: ${errTxt}`);
      }
      const visionJson = await visionResp.json() as any;
      const rawText    = visionJson.responses?.[0]?.fullTextAnnotation?.text ||
                         visionJson.responses?.[0]?.textAnnotations?.[0]?.description || '';
      const detectedMark = extractExamMark(rawText);
      console.log('[OCR] ✅ Google Vision detected mark:', detectedMark, '| raw:', rawText);
      res.json({ detectedMark, rawText, engine: 'google-vision' });
      return;
    } catch (gErr: any) {
      console.error('[OCR] Google Vision also failed:', gErr.message);
    }
  }

  // ── BOTH FAILED ────────────────────────────────────────────────────────
  res.json({ detectedMark: null, rawText: '', engine: 'none' });
});

export default router;
