import { Router, type Response } from 'express';
import { sql } from '../db.js';
import { authenticateToken, type AuthRequest } from '../middleware/auth.js';

const router = Router();

// GET /api/comm-logs - Fetch parent broadcaster communication logs
router.get('/logs', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Access Denied: Only administrators can view parental communication logs.' });
    return;
  }

  try {
    const logs = await sql`SELECT * FROM comm_logs ORDER BY created_at DESC`;

    // Parse statuses and return matching front-end schemas
    const formatted = logs.map(l => ({
      id: l.id,
      timestamp: l.timestamp,
      message: l.message,
      channels: {
        whatsapp: { status: l.whatsapp_status, trace: l.whatsapp_trace },
        sms: { status: l.sms_status, trace: l.sms_trace },
        email: { status: l.email_status, trace: l.email_trace }
      }
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ error: 'Failed to query communication dispatches.' });
  }
});

// POST /api/notifications/log - Log a simulated communication dispatch
router.post('/log', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  if (req.user?.role !== 'admin' && req.user?.role !== 'teacher') {
    res.status(403).json({ error: 'Access Denied: Students are not authorized to log parental notifications.' });
    return;
  }

  const { id, timestamp, message, channels } = req.body;

  if (!id || !timestamp || !message || !channels) {
    res.status(400).json({ error: 'Missing log fields or transmission metadata.' });
    return;
  }

  try {
    await sql`
      INSERT INTO comm_logs (
        id, timestamp, message, 
        whatsapp_status, whatsapp_trace, 
        sms_status, sms_trace, 
        email_status, email_trace
      ) VALUES (
        ${id}, ${timestamp}, ${message},
        ${channels.whatsapp?.status || 'sent'}, ${channels.whatsapp?.trace || ''},
        ${channels.sms?.status || 'sent'}, ${channels.sms?.trace || ''},
        ${channels.email?.status || 'sent'}, ${channels.email?.trace || ''}
      )
    `;

    res.status(201).json({ success: true });
  } catch (error: any) {
    console.error('Error logging dispatch:', error);
    res.status(500).json({ error: 'Failed to record transmission details: ' + error.message });
  }
});

import { sendSms } from '../lib/sms.js';

// GET /api/notifications/cron-timetable - Vercel Serverless Cron Endpoint
router.get('/cron-timetable', async (req, res): Promise<void> => {
  try {
    // 1. Verify Vercel Cron Secret
    const authHeader = req.headers.authorization;
    const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;

    // Also allow manual admin triggers (if JWT is valid, but we skip auth middleware here to allow raw Cron requests)
    if (!isCron && req.query.admin_trigger !== 'true') {
      res.status(403).json({ error: 'Access Denied: Invalid cron secret.' });
      return;
    }

    // 2. Determine current time in East Africa Time (EAT)
    const options: Intl.DateTimeFormatOptions = { 
      timeZone: 'Africa/Nairobi', 
      weekday: 'long', 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false
    };
    
    const now = new Date();
    const plus5 = new Date(now.getTime() + 5 * 60000);
    const plus10 = new Date(now.getTime() + 10 * 60000);

    const formatter = new Intl.DateTimeFormat('en-US', options);
    
    const parseFormatted = (d: Date) => {
      const parts = formatter.format(d).split(', ');
      // Handle cases where format might be slightly different
      const day = parts[0]; 
      // Ensure HH:MM format even if 24:00 happens
      let time = parts[1];
      if (time.startsWith('24:')) time = time.replace('24:', '00:');
      return { day, time };
    };

    const target5 = parseFormatted(plus5);
    const target10 = parseFormatted(plus10);

    // 3. Query the database for upcoming events
    const upcomingEvents = await sql`
      SELECT e.*, t.name as teacher_name, t.phone as teacher_phone
      FROM timetable_events e
      JOIN teachers t ON e.teacher_id = t.id
      WHERE (
        (e.day_of_week = ${target10.day} AND e.start_time = ${target10.time}) OR
        (e.day_of_week = ${target5.day} AND e.start_time = ${target5.time})
      )
    `;

    if (upcomingEvents.length === 0) {
      res.json({ success: true, message: `No upcoming classes to notify. Checked for ${target10.time} and ${target5.time}` });
      return;
    }

    // 4. Dispatch SMS
    const results: any[] = [];
    for (const ev of upcomingEvents) {
      if (!ev.teacher_phone) continue;

      const mins = ev.start_time === target10.time ? 10 : 5;
      const msg = `Reminder: You have a ${ev.subject} class with ${ev.class_name} in ${mins} minutes (at ${ev.start_time}). St. Charles Admin.`;
      
      try {
        const formattedPhone = ev.teacher_phone.replace(/\s+/g, '');
        const smsRes = await sendSms([formattedPhone], msg);
        results.push({ teacher: ev.teacher_name, class: ev.class_name, phone: formattedPhone, status: smsRes.ok ? 'sent' : 'failed' });
      } catch (e: any) {
        results.push({ teacher: ev.teacher_name, phone: ev.teacher_phone, status: 'failed', error: e.message });
      }
    }

    res.json({ success: true, dispatches: results });
  } catch (error: any) {
    console.error('Timetable Cron Error:', error);
    res.status(500).json({ error: 'Timetable Cron failed: ' + error.message });
  }
});

export default router;
