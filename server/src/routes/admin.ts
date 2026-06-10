import { Router, type Response } from 'express';
import { sql } from '../db.js';
import { authenticateToken, type AuthRequest } from '../middleware/auth.js';
import { Resend } from 'resend';
import { sendSms } from '../lib/sms.js';

const router = Router();

// Enforce admin-only access for all administrative routes
router.use(authenticateToken);

router.use((req: AuthRequest, res: Response, next) => {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Access Denied: Only administrators are authorized to access administrative endpoints.' });
    return;
  }
  next();
});

// GET /api/admin/metrics - Compute dashboard statistics strip
router.get('/metrics', async (req: AuthRequest, res: Response) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];

    // 1. Total Enrollment
    const [enrollment] = await sql`SELECT COUNT(*)::int as count FROM students`;

    // 2. Completed registers today
    const [loggedRegs] = await sql`
      SELECT COUNT(*)::int as count FROM attendance_registers 
      WHERE date = ${todayStr}
    `;

    // 3. Today's expected registers
    const [totalTeachers] = await sql`SELECT COUNT(*)::int as count FROM teachers`;
    const expectedRegs = (totalTeachers?.count || 0) * 2; // morning + evening per teacher

    // 4. Calculate today's morning check-in attendance rate
    let dailyRate = 96; // Fallback seed
    const [attendanceStats] = await sql`
      SELECT 
        COUNT(r.id)::int as total_records,
        SUM(CASE WHEN r.status = 'present' THEN 1 ELSE 0 END)::int as present_records
      FROM attendance_records r
      JOIN attendance_registers reg ON r.register_id = reg.id
      WHERE reg.date = ${todayStr} AND reg.session = 'morning'
    `;

    if (attendanceStats && attendanceStats.total_records > 0) {
      dailyRate = Math.round((attendanceStats.present_records / attendanceStats.total_records) * 100);
    }

    res.json({
      totalStudents: enrollment?.count || 0,
      todayAttendanceRate: dailyRate,
      loggedRegistersCount: loggedRegs?.count || 0,
      totalExpectedRegisters: expectedRegs
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to compute dashboard analytics: ' + error.message });
  }
});

// GET /api/admin/registers-summary - List morning/evening checklist completion per teacher
router.get('/registers-summary', async (req: AuthRequest, res: Response) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];

    const summary = await sql`
      SELECT 
        t.id as teacher_id,
        t.name as teacher_name,
        c.name as assigned_stream,
        COALESCE(string_agg(DISTINCT cs.subject_name, ', '), '') as teacher_subject,
        m_reg.submitted_at as morning_submitted,
        e_reg.submitted_at as evening_submitted
      FROM teachers t
      LEFT JOIN classes c ON t.id = c.class_teacher_id
      LEFT JOIN class_subjects cs ON t.id = cs.teacher_id AND cs.class_name = c.name
      LEFT JOIN attendance_registers m_reg ON t.id = m_reg.teacher_id AND m_reg.date = ${todayStr} AND m_reg.session = 'morning'
      LEFT JOIN attendance_registers e_reg ON t.id = e_reg.teacher_id AND e_reg.date = ${todayStr} AND e_reg.session = 'evening'
      GROUP BY t.id, t.name, c.name, m_reg.submitted_at, e_reg.submitted_at
    `;

    const formatted = summary.map(row => ({
      teacherId: row.teacher_id,
      teacherName: row.teacher_name,
      teacherSubject: row.teacher_subject,
      assignedStream: row.assigned_stream,
      morning: row.morning_submitted ? { submittedAt: row.morning_submitted } : null,
      evening: row.evening_submitted ? { submittedAt: row.evening_submitted } : null
    }));

    res.json(formatted);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to query teachers register summary: ' + error.message });
  }
});

// GET /api/admin/timetable - Retrieve classroom scheduling timeline
router.get('/timetable', async (req: AuthRequest, res: Response) => {
  try {
    const events = await sql`
      SELECT e.*, t.name as teacher_name 
      FROM timetable_events e
      JOIN teachers t ON e.teacher_id = t.id
      ORDER BY e.start_time ASC
    `;

    res.json(events);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to query scheduling timeline: ' + error.message });
  }
});

// POST /api/admin/broadcast - Log high fidelity multi-channel parental announcement
router.post('/broadcast', async (req: AuthRequest, res: Response): Promise<void> => {
  const { message, timestamp, targetType, targetValue, targetStudentIds } = req.body;

  if (!message || !timestamp) {
    res.status(400).json({ error: 'Missing broadcast message body or virtual timestamp.' });
    return;
  }

  try {
    let queryStudents: any[] = [];
    let recipientLabel = 'All Parents';

    if (targetType === 'grade' && targetValue) {
      queryStudents = await sql`
        SELECT s.name, p.name as guardian_name, p.phone as guardian_phone, p.email as guardian_email 
        FROM students s
        JOIN parents p ON s.parent_id = p.id
        WHERE s.stream = ${targetValue}
      `;
      recipientLabel = `Parents of ${targetValue}`;
    } else if (targetType === 'students' && targetStudentIds && Array.isArray(targetStudentIds) && targetStudentIds.length > 0) {
      // Multi-select: fetch by array of student IDs
      queryStudents = await sql`
        SELECT s.name, p.name as guardian_name, p.phone as guardian_phone, p.email as guardian_email 
        FROM students s
        JOIN parents p ON s.parent_id = p.id
        WHERE s.id = ANY(${targetStudentIds})
      `;
      recipientLabel = `Selected ${queryStudents.length} parent(s)`;
    } else if (targetType === 'student' && targetValue) {
      queryStudents = await sql`
        SELECT s.name, p.name as guardian_name, p.phone as guardian_phone, p.email as guardian_email 
        FROM students s
        JOIN parents p ON s.parent_id = p.id
        WHERE s.id = ${targetValue}
      `;
      if (queryStudents.length > 0) {
        recipientLabel = `Parent of ${queryStudents[0].name} (${queryStudents[0].guardian_name})`;
      } else {
        recipientLabel = `Parent of Student ID ${targetValue}`;
      }
    } else {
      // Default: all
      queryStudents = await sql`
        SELECT s.name, p.name as guardian_name, p.phone as guardian_phone, p.email as guardian_email 
        FROM students s
        JOIN parents p ON s.parent_id = p.id
      `;
      recipientLabel = 'All School Parents';
    }

    // Extract contacts
    const phoneNumbers = queryStudents.map(s => s.guardian_phone).filter(Boolean);
    const emails = queryStudents.map(s => s.guardian_email).filter(Boolean);
    const names = queryStudents.map(s => `${s.guardian_name} (Parent of ${s.name})`);

    const formattedPhones = phoneNumbers.length > 0 ? phoneNumbers.map(p => p.replace(/\s+/g, '')) : [];
    const formattedEmails = emails.length > 0 ? emails : [];
    const formattedNames = names.length > 0 ? names : ['Default Guardian'];

    const logId = `LOG_${Date.now()}`;
    
    // 1. Send SMS via Onfon
    let smsTrace = 'No phone recipients found';
    let smsStatus = 'skipped';
    if (formattedPhones.length > 0) {
      try {
        const result = await sendSms(formattedPhones, message);
        console.log('Onfon SMS response:', JSON.stringify(result, null, 2));
        smsTrace = result.trace;
        smsStatus = result.ok ? 'sent' : 'failed';
      } catch (e: any) {
        smsTrace = `Failed: ${e.message}`;
        smsStatus = 'failed';
        console.error('Onfon Error:', e.response?.data || e);
      }
    }

    // 2. Send Email via Resend
    let emailTrace = 'No email recipients found';
    let emailStatus = 'skipped';
    if (process.env.RESEND_API_KEY && formattedEmails.length > 0) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const emailResults: string[] = [];
      let successCount = 0;
      let failCount = 0;

      // Determine sender address: use verified domain if set, otherwise onboarding@resend.dev
      const fromAddress = process.env.RESEND_FROM_EMAIL || 'St. Charles School <onboarding@resend.dev>';
      // If no verified domain, Resend only sends to the account owner's email.
      // In that case, send a single admin copy with recipient list in the body.
      const hasVerifiedDomain = !!process.env.RESEND_FROM_EMAIL;

      if (hasVerifiedDomain) {
        // Production: send individually to each parent
        for (const recipientEmail of formattedEmails) {
          try {
            const { data, error } = await resend.emails.send({
              from: fromAddress,
              to: [recipientEmail],
              subject: 'St. Charles School Notice',
              text: message
            });
            if (error) {
              emailResults.push(`${recipientEmail}: Failed (${error.message})`);
              failCount++;
            } else {
              emailResults.push(`${recipientEmail}: Delivered (${data?.id})`);
              successCount++;
            }
          } catch (e: any) {
            emailResults.push(`${recipientEmail}: Exception (${e.message})`);
            failCount++;
          }
        }
      } else {
        // Free tier: send admin summary copy to account owner email
        const adminEmail = process.env.RESEND_ADMIN_EMAIL || 'schoolcharlie143@gmail.com';
        const recipientSummary = formattedEmails.map((email, i) => `${i+1}. ${formattedNames[i] || 'Parent'} <${email}>`).join('\n');
        try {
          const { data, error } = await resend.emails.send({
            from: fromAddress,
            to: [adminEmail],
            subject: `School Notice — Intended for ${formattedEmails.length} parent(s)`,
            text: `BROADCAST MESSAGE:\n\n${message}\n\n---\nINTENDED RECIPIENTS (${formattedEmails.length}):\n${recipientSummary}\n\nNote: Emails could not be sent directly to parents because no verified domain is configured on Resend. Please verify a domain at resend.com/domains to enable direct parent delivery.`
          });
          if (error) {
            emailResults.push(`Admin copy to ${adminEmail}: Failed (${error.message})`);
            failCount++;
          } else {
            emailResults.push(`Admin copy to ${adminEmail}: Delivered (${data?.id}). Direct parent emails pending domain verification.`);
            successCount++;
          }
        } catch (e: any) {
          emailResults.push(`Admin copy to ${adminEmail}: Exception (${e.message})`);
          failCount++;
        }
      }

      emailTrace = emailResults.join(' | ');
      emailStatus = failCount === 0 ? 'delivered' : (successCount > 0 ? 'partial' : 'failed');
    }

    // 3. WhatsApp (Still mocked as per user not providing Meta Token)
    const whatsappStatus = 'skipped';
    const whatsappTrace = 'WhatsApp requires Meta Graph API Token to be provided.';

    await sql`
      INSERT INTO comm_logs (
        id, timestamp, message, 
        whatsapp_status, whatsapp_trace, 
        sms_status, sms_trace, 
        email_status, email_trace
      ) VALUES (
        ${logId},
        ${timestamp},
        ${message},
        ${whatsappStatus},
        ${whatsappTrace},
        ${smsStatus},
        ${smsTrace},
        ${emailStatus},
        ${emailTrace}
      )
    `;

    res.status(201).json({ success: true, logId });
  } catch (error: any) {
    res.status(500).json({ error: 'Broadcaster dispatch error: ' + error.message });
  }
});


// POST /api/admin/timetable - Create a new timetable event
router.post('/timetable', async (req: AuthRequest, res: Response): Promise<void> => {
  const { teacherId, subject, stream, startTime, endTime, room } = req.body;

  if (!teacherId || !subject || !stream || startTime === undefined || endTime === undefined || !room) {
    res.status(400).json({ error: 'Missing required timetable event fields.' });
    return;
  }

  try {
    const [countResult] = await sql`SELECT COUNT(*)::int as count FROM timetable_events`;
    const count = countResult ? countResult.count : 0;
    const newId = `E${String(count + 1).padStart(3, '0')}`;

    await sql`
      INSERT INTO timetable_events (id, teacher_id, subject, stream, start_time, end_time, room)
      VALUES (${newId}, ${teacherId}, ${subject}, ${stream}, ${startTime}, ${endTime}, ${room})
    `;

    res.status(201).json({ success: true, event: { id: newId, teacher_id: teacherId, subject, stream, start_time: startTime, end_time: endTime, room } });
  } catch (error: any) {
    console.error('Error creating timetable event:', error);
    res.status(500).json({ error: 'Failed to create timetable event: ' + error.message });
  }
});

// PUT /api/admin/timetable/:id - Update a timetable event
router.put('/timetable/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { teacherId, subject, stream, startTime, endTime, room } = req.body;

  if (!teacherId || !subject || !stream || startTime === undefined || endTime === undefined || !room) {
    res.status(400).json({ error: 'Missing required timetable event fields.' });
    return;
  }

  try {
    const [exists] = await sql`SELECT id FROM timetable_events WHERE id = ${id}`;
    if (!exists) {
      res.status(404).json({ error: 'Timetable event not found.' });
      return;
    }

    await sql`
      UPDATE timetable_events SET teacher_id = ${teacherId}, subject = ${subject}, stream = ${stream}, start_time = ${startTime}, end_time = ${endTime}, room = ${room}
      WHERE id = ${id}
    `;

    res.json({ success: true, event: { id, teacher_id: teacherId, subject, stream, start_time: startTime, end_time: endTime, room } });
  } catch (error: any) {
    console.error('Error updating timetable event:', error);
    res.status(500).json({ error: 'Failed to update timetable event: ' + error.message });
  }
});

// DELETE /api/admin/timetable/:id - Remove a timetable event
router.delete('/timetable/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const [exists] = await sql`SELECT id FROM timetable_events WHERE id = ${id}`;
    if (!exists) {
      res.status(404).json({ error: 'Timetable event not found.' });
      return;
    }

    await sql`DELETE FROM timetable_events WHERE id = ${id}`;

    res.json({ success: true, message: `Timetable event ${id} removed.` });
  } catch (error: any) {
    console.error('Error deleting timetable event:', error);
    res.status(500).json({ error: 'Failed to remove timetable event: ' + error.message });
  }
});

// GET /api/admin/attendance-history - Query historical attendance data
router.get('/attendance-history', async (req: AuthRequest, res: Response): Promise<void> => {
  const { from, to } = req.query;
  const fromDate = from ? String(from) : new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const toDate = to ? String(to) : new Date().toISOString().split('T')[0];

  try {
    const history = await sql`
      SELECT 
        reg.date,
        reg.session,
        t.name as teacher_name,
        c.name as stream,
        COUNT(r.id)::int as total_students,
        SUM(CASE WHEN r.status = 'present' THEN 1 ELSE 0 END)::int as present_count,
        SUM(CASE WHEN r.status = 'absent' THEN 1 ELSE 0 END)::int as absent_count,
        reg.submitted_at
      FROM attendance_registers reg
      JOIN teachers t ON reg.teacher_id = t.id
      LEFT JOIN classes c ON t.id = c.class_teacher_id
      LEFT JOIN attendance_records r ON r.register_id = reg.id
      WHERE reg.date >= ${fromDate} AND reg.date <= ${toDate}
      GROUP BY reg.id, reg.date, reg.session, t.name, c.name, reg.submitted_at
      ORDER BY reg.date DESC, reg.session ASC
    `;

    res.json(history);
  } catch (error: any) {
    console.error('Error fetching attendance history:', error);
    res.status(500).json({ error: 'Failed to query attendance history: ' + error.message });
  }
});

// POST /api/admin/parents/orphan-resolve - Handle choice to delete or retain orphaned parent records
router.post('/parents/orphan-resolve', async (req: AuthRequest, res: Response): Promise<void> => {
  const { parentId, action, logId } = req.body;

  if (!parentId || !action || !logId) {
    res.status(400).json({ error: 'Missing parent ID, resolution action, or log reference ID.' });
    return;
  }

  try {
    if (action === 'delete') {
      // Check if students are still linked to this parent (just in case)
      const [studentCount] = await sql`SELECT COUNT(*)::int as count FROM students WHERE parent_id = ${parentId}`;
      if (studentCount && studentCount.count > 0) {
        res.status(400).json({ error: 'Cannot delete parent: students are still associated with this parent.' });
        return;
      }
      await sql`DELETE FROM parents WHERE id = ${parentId}`;
    }
    
    // Always remove the orphan alert message
    await sql`DELETE FROM comm_logs WHERE id = ${logId}`;

    res.json({ success: true, message: `Orphaned parent ${parentId} has been ${action === 'delete' ? 'deleted' : 'retained'} and alert dismissed.` });
  } catch (error: any) {
    console.error('Error resolving orphaned parent:', error);
    res.status(500).json({ error: 'Failed to resolve orphaned parent selection: ' + error.message });
  }
});

export default router;
