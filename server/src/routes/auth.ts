import { Router, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db.js';
import { JWT_SECRET, type AuthRequest, authenticateToken } from '../middleware/auth.js';

const router = Router();

// POST /api/auth/login
router.post('/login', (req, res): void => {
  const { role, username, email, studentId, password } = req.body;

  try {
    let matchedUser: { id: string; name: string; role: 'admin' | 'teacher' | 'student'; stream?: string; email?: string } | null = null;

    if (role === 'admin') {
      if (username === 'admin' && password === 'admin123') {
        matchedUser = {
          id: 'ADMIN',
          name: 'Administrator',
          role: 'admin'
        };
      }
    } else if (role === 'teacher') {
      const stmt = db.prepare('SELECT * FROM teachers WHERE LOWER(email) = ?');
      const teacher = stmt.get(email.trim().toLowerCase()) as any;

      if (teacher && teacher.password === password) {
        matchedUser = {
          id: teacher.id,
          name: teacher.name,
          role: 'teacher',
          stream: teacher.stream,
          email: teacher.email
        };
      }
    } else if (role === 'student') {
      const stmt = db.prepare('SELECT * FROM students WHERE UPPER(id) = ?');
      const student = stmt.get(studentId.trim().toUpperCase()) as any;

      if (student && student.password === password) {
        matchedUser = {
          id: student.id,
          name: student.name,
          role: 'student',
          stream: student.stream
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

// GET /api/auth/me (Get profile of logged-in user)
router.get('/me', authenticateToken, (req: AuthRequest, res: Response) => {
  res.json({ user: req.user });
});

export default router;
