import { Router, type Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import { sql } from '../db.js';
import { authenticateToken, type AuthRequest } from '../middleware/auth.js';

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
        max_tokens: 1024
      })
    });

    if (!response.ok) {
      const errBody = await response.json();
      throw new Error(`NVIDIA API returned error status: ${response.status} - ${JSON.stringify(errBody)}`);
    }

    const json = await response.json() as any;
    const answer = json.choices?.[0]?.message?.content || 'Charlie could not generate a response right now.';
    res.json({ response: answer });
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
- "stream": string (Must match one of: "Pre-Primary 1", "Pre-Primary 2", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7A", "Grade 8", "Grade 9")
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

export default router;
