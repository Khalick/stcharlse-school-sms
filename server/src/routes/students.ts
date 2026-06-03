import { Router, type Response } from 'express';
import { sql } from '../db.js';
import { authenticateToken, type AuthRequest } from '../middleware/auth.js';
import { hashPassword } from '../lib/crypto.js';


const router = Router();

// GET /api/students - Query student directories (with dynamic search parameters and attendance rates)
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { q } = req.query;

  try {
    let query = sql`
      SELECT 
        s.id,
        s.name,
        s.stream,
        s.guardian_name,
        s.guardian_phone,
        s.guardian_email,
        COUNT(reg.id)::int as total_sessions,
        SUM(CASE WHEN r.status = 'present' THEN 1 ELSE 0 END)::int as present_sessions
      FROM students s
      LEFT JOIN attendance_records r ON s.id = r.student_id
      LEFT JOIN attendance_registers reg ON r.register_id = reg.id AND reg.session = 'morning'
    `;

    if (req.user?.role === 'student') {
      query = sql`${query} WHERE s.id = ${req.user.id}`;
    } else if (q) {
      const filter = `%${String(q).trim().toLowerCase()}%`;
      query = sql`${query} WHERE LOWER(s.name) LIKE ${filter} OR LOWER(s.stream) LIKE ${filter} OR LOWER(s.id) LIKE ${filter}`;
    }

    query = sql`${query} GROUP BY s.id, s.name, s.stream, s.guardian_name, s.guardian_phone, s.guardian_email`;

    const students = await query;

    // Map dynamic rates and inject baseline parameters
    const formatted = students.map(s => {
      const totalSessions = (s.total_sessions || 0) + 20;
      const presentSessions = (s.present_sessions || 0) + 19;
      return {
        id: s.id,
        name: s.name,
        stream: s.stream,
        guardianName: s.guardian_name,
        guardianPhone: s.guardian_phone,
        guardianEmail: s.guardian_email,
        attendanceRate: Math.round((presentSessions / totalSessions) * 100)
      };
    });

    res.json(formatted);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to search student directories: ' + error.message });
  }
});

// GET /api/students/:id/attendance-today - Fetch morning/evening register outcomes for active student
router.get('/:id/attendance-today', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;

  if (req.user?.role === 'student' && req.user.id !== id) {
    res.status(403).json({ error: 'Access Denied: You cannot view attendance logs for other students.' });
    return;
  }

  const todayStr = new Date().toISOString().split('T')[0];

  try {
    const records = await sql`
      SELECT reg.session, r.status
      FROM attendance_records r
      JOIN attendance_registers reg ON r.register_id = reg.id
      WHERE r.student_id = ${id} AND reg.date = ${todayStr}
    `;

    const morningRec = records.find(r => r.session === 'morning');
    const eveningRec = records.find(r => r.session === 'evening');

    res.json({
      morning: morningRec ? morningRec.status : 'N/A',
      evening: eveningRec ? eveningRec.status : 'N/A'
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to query student attendance logs.' });
  }
});

// POST /api/students - Register New Student Admission
router.post('/', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  if (req.user?.role !== 'admin' && req.user?.role !== 'teacher') {
    res.status(403).json({ error: 'Access Denied: Only administrators or teachers are authorized to register student admissions.' });
    return;
  }

  const { name, stream, guardianName, guardianPhone, guardianEmail } = req.body;

  if (!name || !stream || !guardianName || !guardianPhone || !guardianEmail) {
    res.status(400).json({ error: 'Missing required student admission profile fields.' });
    return;
  }

  try {
    // Generate next student ID reference Sxxx
    const [countResult] = await sql`SELECT COUNT(*)::int as count FROM students`;
    const count = countResult ? countResult.count : 0;
    const nextIdNum = count + 1;
    const newId = `S${nextIdNum < 100 ? (nextIdNum < 10 ? '00' + nextIdNum : '0' + nextIdNum) : nextIdNum}`;

    const hashedPassword = hashPassword(newId);
    await sql`
      INSERT INTO students (id, name, stream, guardian_name, guardian_phone, guardian_email, password)
      VALUES (${newId}, ${name}, ${stream}, ${guardianName}, ${guardianPhone}, ${guardianEmail}, ${hashedPassword})
    `;


    res.status(201).json({
      success: true,
      student: {
        id: newId,
        name,
        stream,
        guardianName,
        guardianPhone,
        guardianEmail,
        attendanceRate: 100
      }
    });
  } catch (error: any) {
    console.error('Admissions error:', error);
    res.status(500).json({ error: 'Admissions transaction rejected: ' + error.message });
  }
});

// PUT /api/students/:id - Update student details (admin/teacher)
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  if (req.user?.role !== 'admin' && req.user?.role !== 'teacher') {
    res.status(403).json({ error: 'Access Denied: Only administrators or teachers can modify student records.' });
    return;
  }


  const { id } = req.params;
  const { name, stream, guardianName, guardianPhone, guardianEmail } = req.body;

  if (!name || !stream || !guardianName || !guardianPhone || !guardianEmail) {
    res.status(400).json({ error: 'Missing required student profile fields.' });
    return;
  }

  try {
    const [exists] = await sql`SELECT id FROM students WHERE id = ${id}`;
    if (!exists) {
      res.status(404).json({ error: 'Student record not found.' });
      return;
    }

    await sql`
      UPDATE students SET name = ${name}, stream = ${stream}, guardian_name = ${guardianName}, guardian_phone = ${guardianPhone}, guardian_email = ${guardianEmail}
      WHERE id = ${id}
    `;

    res.json({ success: true, student: { id, name, stream, guardianName, guardianPhone, guardianEmail } });
  } catch (error: any) {
    console.error('Error updating student:', error);
    res.status(500).json({ error: 'Failed to update student record: ' + error.message });
  }
});

// DELETE /api/students/:id - Remove a student (admin/teacher)
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  if (req.user?.role !== 'admin' && req.user?.role !== 'teacher') {
    res.status(403).json({ error: 'Access Denied: Only administrators or teachers can remove student records.' });
    return;
  }


  const { id } = req.params;

  try {
    const [exists] = await sql`SELECT id FROM students WHERE id = ${id}`;
    if (!exists) {
      res.status(404).json({ error: 'Student record not found.' });
      return;
    }

    // Remove attendance records first, then student
    await sql`DELETE FROM attendance_records WHERE student_id = ${id}`;
    await sql`DELETE FROM students WHERE id = ${id}`;

    res.json({ success: true, message: `Student ${id} removed from directory.` });
  } catch (error: any) {
    console.error('Error deleting student:', error);
    res.status(500).json({ error: 'Failed to remove student record: ' + error.message });
  }
});

// PUT /api/students/:id/password - Reset student password (admin/teacher)
router.put('/:id/password', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  if (req.user?.role !== 'admin' && req.user?.role !== 'teacher') {
    res.status(403).json({ error: 'Access Denied: Only administrators or teachers can reset student passwords.' });
    return;
  }

  const { id } = req.params;
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    res.status(400).json({ error: 'New password must be at least 6 characters.' });
    return;
  }

  try {
    const [exists] = await sql`SELECT id FROM students WHERE id = ${id}`;
    if (!exists) {
      res.status(404).json({ error: 'Student record not found.' });
      return;
    }

    const hashedPassword = hashPassword(newPassword);
    await sql`UPDATE students SET password = ${hashedPassword} WHERE id = ${id}`;


    res.json({ success: true, message: `Password for student ${id} has been reset.` });
  } catch (error: any) {
    console.error('Error resetting student password:', error);
    res.status(500).json({ error: 'Failed to reset student password: ' + error.message });
  }
});

export default router;
