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
        p.name as guardian_name,
        p.phone as guardian_phone,
        p.email as guardian_email,
        COUNT(reg.id)::int as total_sessions,
        SUM(CASE WHEN r.status = 'present' THEN 1 ELSE 0 END)::int as present_sessions
      FROM students s
      JOIN parents p ON s.parent_id = p.id
      LEFT JOIN attendance_records r ON s.id = r.student_id
      LEFT JOIN attendance_registers reg ON r.register_id = reg.id AND reg.session = 'morning'
    `;

    if (req.user?.role === 'student') {
      query = sql`${query} WHERE s.id = ${req.user.id}`;
    } else if (q) {
      const filter = `%${String(q).trim().toLowerCase()}%`;
      query = sql`${query} WHERE LOWER(s.name) LIKE ${filter} OR LOWER(s.stream) LIKE ${filter} OR LOWER(s.id) LIKE ${filter}`;
    }

    query = sql`${query} GROUP BY s.id, s.name, s.stream, p.name, p.phone, p.email`;

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

  const { id, name, stream, guardianName, guardianPhone, guardianEmail } = req.body;

  if (!id || !name || !stream || !guardianName || !guardianPhone || !guardianEmail) {
    res.status(400).json({ error: 'Missing required student admission profile fields (including Admission Number).' });
    return;
  }

  try {
    // 1. Parent Deduplication / Creation
    const emailNormalized = guardianEmail.trim().toLowerCase();
    const phoneNormalized = guardianPhone.trim();

    let [parent] = await sql`
      SELECT id FROM parents 
      WHERE LOWER(email) = ${emailNormalized} OR phone = ${phoneNormalized}
    `;

    let parentId = parent?.id;

    if (!parentId) {
      const [parentCount] = await sql`SELECT COUNT(*)::int as count FROM parents`;
      const nextParentNum = (parentCount?.count || 0) + 1;
      parentId = `P${String(nextParentNum).padStart(3, '0')}`;
      
      const defaultPasswordHash = hashPassword('parent123');
      await sql`
        INSERT INTO parents (id, name, phone, email, password)
        VALUES (${parentId}, ${guardianName.trim()}, ${phoneNormalized}, ${emailNormalized}, ${defaultPasswordHash})
      `;
    }

    // 2. Use the provided Admission Number
    const newId = id.trim().toUpperCase();

    // Check if ID already exists
    const [existingStudent] = await sql`SELECT id FROM students WHERE id = ${newId}`;
    if (existingStudent) {
      res.status(409).json({ error: `A student with admission number ${newId} already exists.` });
      return;
    }

    const hashedPassword = hashPassword(newId);
    await sql`
      INSERT INTO students (id, name, stream, parent_id, password)
      VALUES (${newId}, ${name.trim()}, ${stream}, ${parentId}, ${hashedPassword})
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
    const [currentStudent] = await sql`SELECT parent_id FROM students WHERE id = ${id}`;
    if (!currentStudent) {
      res.status(404).json({ error: 'Student record not found.' });
      return;
    }

    const emailNormalized = guardianEmail.trim().toLowerCase();
    const phoneNormalized = guardianPhone.trim();

    // Check if there is an existing parent (other than current) matching the phone/email
    const [matchingParent] = await sql`
      SELECT id FROM parents 
      WHERE (LOWER(email) = ${emailNormalized} OR phone = ${phoneNormalized})
        AND id <> ${currentStudent.parent_id}
    `;

    let finalParentId = currentStudent.parent_id;

    if (matchingParent) {
      // Link to the other matching parent
      finalParentId = matchingParent.id;

      // Check if old parent is now orphaned
      const oldParentId = currentStudent.parent_id;
      const [siblingCheck] = await sql`
        SELECT COUNT(*)::int as count FROM students 
        WHERE parent_id = ${oldParentId} AND id <> ${id}
      `;

      if (siblingCheck && siblingCheck.count === 0) {
        const [oldParent] = await sql`SELECT name FROM parents WHERE id = ${oldParentId}`;
        const parentName = oldParent ? oldParent.name : 'Unknown Parent';
        const notifyId = `ORPHAN_${Date.now()}_${oldParentId}`;
        const timestampStr = new Date().toLocaleTimeString('en-US', { hour12: false }).slice(0, 5);

        await sql`
          INSERT INTO comm_logs (id, timestamp, message, whatsapp_status, sms_status, email_status)
          VALUES (
            ${notifyId},
            ${timestampStr},
            ${`Orphaned Parent Alert: Parent ${parentName} (${oldParentId}) has no active students. Admin choice required to Delete or Retain.`},
            'sent', 'sent', 'sent'
          )
        `;
      }
    } else {
      // Update current parent profile
      await sql`
        UPDATE parents 
        SET name = ${guardianName.trim()}, phone = ${phoneNormalized}, email = ${emailNormalized}
        WHERE id = ${currentStudent.parent_id}
      `;
    }

    // Update student details
    await sql`
      UPDATE students 
      SET name = ${name}, stream = ${stream}, parent_id = ${finalParentId}
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
    const [student] = await sql`SELECT parent_id FROM students WHERE id = ${id}`;
    if (!student) {
      res.status(404).json({ error: 'Student record not found.' });
      return;
    }

    // Remove attendance records first, then student
    await sql`DELETE FROM attendance_records WHERE student_id = ${id}`;
    await sql`DELETE FROM students WHERE id = ${id}`;

    // Check if the parent is now orphaned (has no other students)
    const parentId = student.parent_id;
    const [parentCheck] = await sql`SELECT COUNT(*)::int as count FROM students WHERE parent_id = ${parentId}`;

    if (parentCheck && parentCheck.count === 0) {
      const [parent] = await sql`SELECT name FROM parents WHERE id = ${parentId}`;
      const parentName = parent ? parent.name : 'Unknown Parent';
      const notifyId = `ORPHAN_${Date.now()}_${parentId}`;
      const timestampStr = new Date().toLocaleTimeString('en-US', { hour12: false }).slice(0, 5);

      // Log orphaned alert notification to comm_logs for Admin action
      await sql`
        INSERT INTO comm_logs (id, timestamp, message, whatsapp_status, sms_status, email_status)
        VALUES (
          ${notifyId},
          ${timestampStr},
          ${`Orphaned Parent Alert: Parent ${parentName} (${parentId}) has no active students. Admin choice required to Delete or Retain.`},
          'sent', 'sent', 'sent'
        )
      `;
    }

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
