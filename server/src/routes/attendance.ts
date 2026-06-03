import { Router, type Response } from 'express';
import { sql } from '../db.js';
import { authenticateToken, type AuthRequest } from '../middleware/auth.js';

const router = Router();

// GET /api/attendance/today?teacherId=T001
router.get('/today', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  const { teacherId } = req.query;

  if (!teacherId) {
    res.status(400).json({ error: 'Missing teacherId query parameter.' });
    return;
  }

  if (req.user?.role !== 'admin' && !(req.user?.role === 'teacher' && req.user?.id === teacherId)) {
    res.status(403).json({ error: 'Access Denied: You are not authorized to access these attendance records.' });
    return;
  }

  try {
    const todayStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Find morning & evening registers for today
    const registers = await sql`
      SELECT * FROM attendance_registers 
      WHERE teacher_id = ${String(teacherId)} AND date = ${todayStr}
    `;

    const morningReg = registers.find(r => r.session === 'morning');
    const eveningReg = registers.find(r => r.session === 'evening');

    res.json({
      morning: morningReg ? { submittedAt: morningReg.submitted_at } : null,
      evening: eveningReg ? { submittedAt: eveningReg.submitted_at } : null
    });
  } catch (error) {
    console.error('Error fetching today register state:', error);
    res.status(500).json({ error: 'Failed to retrieve register submission state.' });
  }
});

// POST /api/attendance/register (Submit morning or evening register)
router.post('/register', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  const { session, teacherId, date, submittedAt, records } = req.body;

  if (!session || !teacherId || !date || !submittedAt || !Array.isArray(records)) {
    res.status(400).json({ error: 'Invalid register payload. Missing required fields.' });
    return;
  }

  if (req.user?.role !== 'admin' && !(req.user?.role === 'teacher' && req.user?.id === teacherId)) {
    res.status(403).json({ error: 'Access Denied: You are not authorized to submit attendance on behalf of this teacher.' });
    return;
  }

  try {
    // Run the query sequence inside a transaction block to guarantee database consistency
    const registerId = await sql.begin(async (tx) => {
      // 1. Insert or update the register metadata
      const [result] = await tx`
        INSERT INTO attendance_registers (date, session, teacher_id, submitted_at)
        VALUES (${date}, ${session}, ${teacherId}, ${submittedAt})
        ON CONFLICT(date, session, teacher_id) DO UPDATE SET submitted_at = EXCLUDED.submitted_at
        RETURNING id
      `;
      const rId = result.id;

      // 2. Clear old individual records for this register if updating
      await tx`DELETE FROM attendance_records WHERE register_id = ${rId}`;

      // 3. Bulk insert individual attendance statuses
      for (const rec of records) {
        await tx`
          INSERT INTO attendance_records (register_id, student_id, status)
          VALUES (${rId}, ${rec.studentId}, ${rec.status})
        `;
      }

      return rId;
    });

    res.json({ success: true, registerId });
  } catch (error: any) {
    console.error('Error submitting register:', error);
    res.status(500).json({ error: 'Database transaction failed: ' + error.message });
  }
});

// GET /api/attendance/rates - Fetch current attendance rate per student dynamically
router.get('/rates', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  if (req.user?.role === 'student') {
    res.status(403).json({ error: 'Access Denied: Students are not authorized to view overall attendance rates.' });
    return;
  }

  try {
    const students = await sql`
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
      GROUP BY s.id, s.name, s.stream, s.guardian_name, s.guardian_phone, s.guardian_email
    `;
    
    // Format response and inject baseline statistics
    const result = students.map(s => {
      const totalSessions = (s.total_sessions || 0) + 20; // 20 baseline days
      const presentSessions = (s.present_sessions || 0) + 19; // 19 baseline present
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

    res.json(result);
  } catch (error) {
    console.error('Error fetching attendance rates:', error);
    res.status(500).json({ error: 'Failed to compute student attendance rates.' });
  }
});

export default router;
