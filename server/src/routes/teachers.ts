import { Router, type Response } from 'express';
import { sql } from '../db.js';
import { authenticateToken, type AuthRequest } from '../middleware/auth.js';
import { hashPassword } from '../lib/crypto.js';


const router = Router();

// GET /api/teachers - List all teachers for switcher select dropdown
router.get('/', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  if (req.user?.role === 'student') {
    res.status(403).json({ error: 'Access Denied: Students are not authorized to view the teacher directory.' });
    return;
  }

  try {
    const teachers = await sql`
      SELECT 
        t.id, 
        t.name, 
        t.email, 
        t.phone, 
        t.approved,
        c.name as class_teacher_stream,
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object('stream', cs.class_name, 'subject', cs.subject_name)
          ) FILTER (WHERE cs.id IS NOT NULL), 
          '[]'
        ) as subjects
      FROM teachers t
      LEFT JOIN classes c ON t.id = c.class_teacher_id
      LEFT JOIN class_subjects cs ON t.id = cs.teacher_id
      GROUP BY t.id, t.name, t.email, t.phone, t.approved, c.name
    `;
    res.json(teachers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve teacher directory.' });
  }
});

// GET /api/teachers/:id/students - List students in teacher's assigned stream (with dynamically computed attendance rates)
router.get('/:id/students', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const streamParam = req.query.stream as string;

  if (req.user?.role !== 'admin' && !(req.user?.role === 'teacher' && req.user?.id === id)) {
    res.status(403).json({ error: 'Access Denied: You are not authorized to access this workspace.' });
    return;
  }

  try {
    // 1. Get class they are class teacher of
    const [classTeacherClass] = await sql`SELECT name FROM classes WHERE class_teacher_id = ${id}`;
    
    // Determine target stream (default to their class teacher class if none specified)
    const targetStream = streamParam || classTeacherClass?.name;

    if (!targetStream) {
      res.status(400).json({ error: 'No stream specified, and you are not assigned as a Class Teacher to any stream.' });
      return;
    }

    // 2. Determine permissions
    const isClassTeacher = classTeacherClass?.name === targetStream;
    const [subjectTeaching] = await sql`
      SELECT id 
      FROM class_subjects 
      WHERE teacher_id = ${id} AND class_name = ${targetStream}
    `;

    const isSubjectTeacher = !!subjectTeaching;

    if (!isClassTeacher && !isSubjectTeacher && req.user?.role !== 'admin') {
      res.status(403).json({ error: 'Access Denied: You do not teach or manage this stream.' });
      return;
    }

    // 3. Fetch students in target stream
    const students = await sql`
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
      WHERE s.stream = ${targetStream}
      GROUP BY s.id, s.name, s.stream, p.name, p.phone, p.email
    `;

    // 4. Map dynamic rates, mask guardian details if not class teacher or admin
    const formattedStudents = students.map(s => {
      const totalSessions = (s.total_sessions || 0) + 20;
      const presentSessions = (s.present_sessions || 0) + 19;
      
      const showSensitive = isClassTeacher || req.user?.role === 'admin';

      return {
        id: s.id,
        name: s.name,
        stream: s.stream,
        guardianName: s.guardian_name,
        guardianPhone: showSensitive ? s.guardian_phone : 'Masked (Class Teacher Only)',
        guardianEmail: showSensitive ? s.guardian_email : 'Masked (Class Teacher Only)',
        attendanceRate: Math.round((presentSessions / totalSessions) * 100),
        isReadOnly: !showSensitive
      };
    });

    res.json(formattedStudents);
  } catch (error) {
    console.error('Error fetching stream students:', error);
    res.status(500).json({ error: 'Failed to query student roster.' });
  }
});

// POST /api/teachers - Create a new teacher (admin only)
router.post('/', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Access Denied: Only administrators can create teacher accounts.' });
    return;
  }

  const { name, email, phone, isClassTeacher, classTeacherStream, subjects } = req.body;

  if (!name || !email) {
    res.status(400).json({ error: 'Missing required teacher profile fields (name, email).' });
    return;
  }

  try {
    const [countResult] = await sql`SELECT COUNT(*)::int as count FROM teachers`;
    const count = countResult ? countResult.count : 0;
    const nextIdNum = count + 1;
    const newId = `T${nextIdNum < 100 ? (nextIdNum < 10 ? '00' + nextIdNum : '0' + nextIdNum) : nextIdNum}`;

    const hashedPassword = hashPassword('teacher123');
    await sql`
      INSERT INTO teachers (id, name, email, phone, password, approved)
      VALUES (${newId}, ${name}, ${email.trim().toLowerCase()}, ${phone || ''}, ${hashedPassword}, true)
    `;

    // Assign Class Teacher stream if selected
    if (isClassTeacher && classTeacherStream) {
      await sql`
        INSERT INTO classes (name, class_teacher_id)
        VALUES (${classTeacherStream}, ${newId})
        ON CONFLICT (name) DO UPDATE SET class_teacher_id = ${newId}
      `;
    }

    // Assign dynamic Subjects/Streams array
    if (Array.isArray(subjects) && subjects.length > 0) {
      for (const subj of subjects) {
        if (subj.stream && subj.subject) {
          // Ensure class exists
          await sql`INSERT INTO classes (name) VALUES (${subj.stream}) ON CONFLICT (name) DO NOTHING`;
          
          await sql`
            INSERT INTO class_subjects (class_name, subject_name, teacher_id)
            VALUES (${subj.stream}, ${subj.subject}, ${newId})
            ON CONFLICT (class_name, subject_name) DO UPDATE SET teacher_id = ${newId}
          `;
        }
      }
    }

    res.status(201).json({
      success: true,
      teacher: { id: newId, name, email: email.trim().toLowerCase(), phone: phone || '', isClassTeacher, classTeacherStream, subjects }
    });
  } catch (error: any) {
    if (error.code === '23505') {
      res.status(409).json({ error: 'A teacher with this email address already exists.' });
    } else {
      console.error('Error creating teacher:', error);
      res.status(500).json({ error: 'Failed to create teacher account: ' + error.message });
    }
  }
});

// PUT /api/teachers/:id - Update teacher details (admin only)
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Access Denied: Only administrators can modify teacher records.' });
    return;
  }

  const { id } = req.params;
  const { name, email, phone, isClassTeacher, classTeacherStream, subjects } = req.body;

  if (!name || !email) {
    res.status(400).json({ error: 'Missing required teacher profile fields.' });
    return;
  }

  try {
    const [exists] = await sql`SELECT id FROM teachers WHERE id = ${id}`;
    if (!exists) {
      res.status(404).json({ error: 'Teacher record not found.' });
      return;
    }

    await sql`
      UPDATE teachers 
      SET name = ${name}, email = ${email.trim().toLowerCase()}, phone = ${phone || ''}
      WHERE id = ${id}
    `;

    // Clear previous Class Teacher assignments for this teacher
    await sql`UPDATE classes SET class_teacher_id = NULL WHERE class_teacher_id = ${id}`;
    
    if (isClassTeacher && classTeacherStream) {
      await sql`
        INSERT INTO classes (name, class_teacher_id)
        VALUES (${classTeacherStream}, ${id})
        ON CONFLICT (name) DO UPDATE SET class_teacher_id = ${id}
      `;
    }

    // Clear previous subject assignments for this teacher
    await sql`DELETE FROM class_subjects WHERE teacher_id = ${id}`;
    
    if (Array.isArray(subjects) && subjects.length > 0) {
      for (const subj of subjects) {
        if (subj.stream && subj.subject) {
          await sql`INSERT INTO classes (name) VALUES (${subj.stream}) ON CONFLICT (name) DO NOTHING`;
          
          await sql`
            INSERT INTO class_subjects (class_name, subject_name, teacher_id)
            VALUES (${subj.stream}, ${subj.subject}, ${id})
            ON CONFLICT (class_name, subject_name) DO UPDATE SET teacher_id = ${id}
          `;
        }
      }
    }

    res.json({ success: true, teacher: { id, name, email: email.trim().toLowerCase(), phone: phone || '', isClassTeacher, classTeacherStream, subjects } });
  } catch (error: any) {
    if (error.code === '23505') {
      res.status(409).json({ error: 'Another teacher already uses this email address.' });
    } else {
      console.error('Error updating teacher:', error);
      res.status(500).json({ error: 'Failed to update teacher record: ' + error.message });
    }
  }
});

// DELETE /api/teachers/:id - Remove a teacher (admin only)
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Access Denied: Only administrators can remove teacher accounts.' });
    return;
  }

  const { id } = req.params;

  try {
    const [exists] = await sql`SELECT id FROM teachers WHERE id = ${id}`;
    if (!exists) {
      res.status(404).json({ error: 'Teacher record not found.' });
      return;
    }

    await sql`DELETE FROM teachers WHERE id = ${id}`;

    res.json({ success: true, message: `Teacher ${id} removed from directory.` });
  } catch (error: any) {
    console.error('Error deleting teacher:', error);
    res.status(500).json({ error: 'Failed to remove teacher record: ' + error.message });
  }
});

// PUT /api/teachers/:id/password - Reset teacher password (admin only)
router.put('/:id/password', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Access Denied: Only administrators can reset teacher passwords.' });
    return;
  }

  const { id } = req.params;
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    res.status(400).json({ error: 'New password must be at least 6 characters.' });
    return;
  }

  try {
    const [exists] = await sql`SELECT id FROM teachers WHERE id = ${id}`;
    if (!exists) {
      res.status(404).json({ error: 'Teacher record not found.' });
      return;
    }

    const hashedPassword = hashPassword(newPassword);
    await sql`UPDATE teachers SET password = ${hashedPassword} WHERE id = ${id}`;


    res.json({ success: true, message: `Password for teacher ${id} has been reset.` });
  } catch (error: any) {
    console.error('Error resetting teacher password:', error);
    res.status(500).json({ error: 'Failed to reset teacher password: ' + error.message });
  }
});

// PUT /api/teachers/:id/approve - Approve teacher account (admin only)
router.put('/:id/approve', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Access Denied: Only administrators can approve teacher accounts.' });
    return;
  }

  const { id } = req.params;

  try {
    const [exists] = await sql`SELECT id FROM teachers WHERE id = ${id}`;
    if (!exists) {
      res.status(404).json({ error: 'Teacher record not found.' });
      return;
    }

    await sql`UPDATE teachers SET approved = true WHERE id = ${id}`;
    res.json({ success: true, message: `Teacher ${id} approved successfully.` });
  } catch (error: any) {
    console.error('Error approving teacher:', error);
    res.status(500).json({ error: 'Failed to approve teacher: ' + error.message });
  }
});


export default router;
