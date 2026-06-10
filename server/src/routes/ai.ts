import { Router, type Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import { sql } from '../db.js';
import { authenticateToken, type AuthRequest } from '../middleware/auth.js';

const upload = multer({ dest: 'uploads/' });
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

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Groq API key not configured on server.' });
      return;
    }

    // 3. Request Llama 3 via Groq
    const systemPrompt = `You are Charlie, the AI Study Companion for St. Charles School in Thika Kiganjo, Kenya. 
You are helping the student "${student.name}" (Grade: ${student.stream}) study the notes titled "${materialTitle}" (Subject: ${materialSubject}).
Your task is to answer the student's question accurately and helpfully using the study notes context below.
Be supportive, speak directly to the student in an encouraging and educational manner, and keep your explanations clear, concise, and appropriate for grade-school pupils.

VISUAL LEARNING INTEGRATION (CRITICAL REQUIREMENT):
If the student asks about a physical object, organ (e.g. digestive tract, liver, stomach), process, tool, or scene, YOU MUST START YOUR RESPONSE with an educational markdown image!
Use the free Pollinations AI engine. Replace spaces with hyphens in the URL.
Format EXACTLY like this: \`![Alt Text](https://image.pollinations.ai/prompt/detailed-kid-friendly-educational-diagram-of-a-[topic]?width=800&height=400&nologo=true)\`
Example: \`![Diagram of the Digestive System](https://image.pollinations.ai/prompt/highly-detailed-educational-diagram-of-the-human-digestive-system-organs-with-labels-kid-friendly-science?width=800&height=400&nologo=true)\`

DO NOT FORGET THE IMAGE MARKDOWN IF THE TOPIC IS VISUAL. Place the image at the very beginning of your response, then provide your text explanation below it.

STUDY HANDOUT NOTES:
---------------------
${materialContent}
---------------------`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query }
        ],
        temperature: 0.6,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      const errBody = await response.json();
      throw new Error(`Groq API returned error status: ${response.status} - ${JSON.stringify(errBody)}`);
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
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Groq API key not configured on server.' });
      return;
    }

    let model = 'llama-3.1-8b-instant';
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
      model = 'llama-3.2-11b-vision-preview';
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

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errBody = await response.json();
      throw new Error(`Groq API returned error status: ${response.status} - ${JSON.stringify(errBody)}`);
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

export default router;
