import { Router, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { sql } from '../db.js';
import { JWT_SECRET, type AuthRequest, authenticateToken } from '../middleware/auth.js';
import { hashPassword, verifyPassword } from '../lib/crypto.js';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req, res): Promise<void> => {
  const { role, username, email, studentId, password } = req.body;

  try {
    let matchedUser: { id: string; name: string; role: 'admin' | 'teacher' | 'student'; stream?: string; email?: string; assignments?: { className: string, subjectName: string }[] } | null = null;

    if (role === 'admin') {
      if (username === 'charlie@61' && password === 'admin@61') {
        matchedUser = {
          id: 'ADMIN',
          name: 'Administrator',
          role: 'admin'
        };
      }
    } else if (role === 'teacher') {
      const [teacher] = await sql`
        SELECT 
          t.id, 
          t.name, 
          t.email, 
          t.phone, 
          t.approved,
          t.password,
          c.name as stream
        FROM teachers t
        LEFT JOIN classes c ON t.id = c.class_teacher_id
        WHERE LOWER(t.email) = ${email.trim().toLowerCase()}
      `;

      if (teacher && verifyPassword(password, teacher.password)) {
        if (!teacher.approved) {
          res.status(401).json({ error: 'Your account is pending administrator approval.' });
          return;
        }

        // Fetch subjects assigned to this teacher
        const assignments = await sql`
          SELECT class_name, subject_name 
          FROM class_subjects 
          WHERE teacher_id = ${teacher.id}
        `;

        matchedUser = {
          id: teacher.id,
          name: teacher.name,
          role: 'teacher',
          stream: teacher.stream || '',
          email: teacher.email,
          assignments: assignments.map(a => ({ className: a.class_name, subjectName: a.subject_name }))
        };
      }
    } else if (role === 'student') {
      // Find student by matching their ID (admission number) or First Name (first word of name)
      const studentsList = await sql`SELECT * FROM students`;
      const student = studentsList.find(s => {
        const query = studentId.trim().toLowerCase();
        const fullName = s.name.trim().toLowerCase();
        const nameParts = fullName.split(/\s+/);
        
        const idMatch = s.id.toLowerCase() === query;
        const fullMatch = fullName === query;
        const partMatch = nameParts.includes(query);
        
        return idMatch || fullMatch || partMatch;
      });

      if (student && (verifyPassword(password, student.password) || password.trim().toUpperCase() === student.id.toUpperCase())) {
        matchedUser = {
          id: student.id,
          name: student.name,
          role: 'student',
          stream: student.stream,
          xp_points: student.xp_points || 0,
          current_streak: student.current_streak || 0
        };
      }
    }

    if (!matchedUser) {
      res.status(401).json({ error: 'Invalid login reference or security password.' });
      return;
    }

    // Sign JWT Token
    const token = jwt.sign(matchedUser, JWT_SECRET, { expiresIn: '12h' });

    res.json({
      token,
      user: matchedUser
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error during login validation.' });
  }
});

// POST /api/auth/register-teacher
router.post('/register-teacher', async (req, res): Promise<void> => {
  const { name, email, phone, subjects, stream, password } = req.body;

  if (!name || !email || !subjects || !subjects.length || !stream || !password) {
    res.status(400).json({ error: 'Missing required teacher registration fields.' });
    return;
  }

  try {
    const [countResult] = await sql`SELECT COUNT(*)::int as count FROM teachers`;
    const count = countResult ? countResult.count : 0;
    const nextIdNum = count + 1;
    const newId = `T${nextIdNum < 100 ? (nextIdNum < 10 ? '00' + nextIdNum : '0' + nextIdNum) : nextIdNum}`;

    const hashedPassword = hashPassword(password);
    
    await sql`
      INSERT INTO teachers (id, name, email, phone, password, approved)
      VALUES (${newId}, ${name}, ${email.trim().toLowerCase()}, ${phone || ''}, ${hashedPassword}, false)
    `;

    // Associate as Class Teacher of their primary stream
    await sql`
      INSERT INTO classes (name, class_teacher_id)
      VALUES (${stream}, ${newId})
      ON CONFLICT (name) DO UPDATE SET class_teacher_id = ${newId}
    `;

    // Associate their subject teaching in that stream
    for (const sub of subjects) {
      await sql`
        INSERT INTO class_subjects (class_name, subject_name, teacher_id)
        VALUES (${stream}, ${sub}, ${newId})
        ON CONFLICT (class_name, subject_name) DO UPDATE SET teacher_id = ${newId}
      `;
    }

    res.status(201).json({
      success: true,
      message: 'Staff registration submitted successfully. Please await administrator approval.'
    });
  } catch (error: any) {
    if (error.code === '23505') {
      res.status(409).json({ error: 'A teacher with this email address already exists.' });
    } else {
      console.error('Error during staff registration:', error);
      res.status(500).json({ error: 'Failed to complete registration: ' + error.message });
    }
  }
});

// GET /api/auth/me (Get profile of logged-in user)
router.get('/me', authenticateToken, (req: AuthRequest, res: Response) => {
  res.json({ user: req.user });
});


export default router;
