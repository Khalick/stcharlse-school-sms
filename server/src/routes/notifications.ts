import { Router, type Response } from 'express';
import { db } from '../db.js';
import { authenticateToken, type AuthRequest } from '../middleware/auth.js';

const router = Router();

// GET /api/comm-logs - Fetch parent broadcaster communication logs
router.get('/logs', authenticateToken, (req: AuthRequest, res: Response): void => {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Access Denied: Only administrators can view parental communication logs.' });
    return;
  }

  try {
    const stmt = db.prepare('SELECT * FROM comm_logs ORDER BY rowid DESC');
    const logs = stmt.all() as any[];

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
    res.status(500).json({ error: 'Failed to query communication dispatches.' });
  }
});

// POST /api/notifications/log - Log a simulated communication dispatch
router.post('/log', authenticateToken, (req: AuthRequest, res: Response): void => {
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
    const insertStmt = db.prepare(`
      INSERT INTO comm_logs (
        id, timestamp, message, 
        whatsapp_status, whatsapp_trace, 
        sms_status, sms_trace, 
        email_status, email_trace
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      id,
      timestamp,
      message,
      channels.whatsapp?.status || 'sent',
      channels.whatsapp?.trace || '',
      channels.sms?.status || 'sent',
      channels.sms?.trace || '',
      channels.email?.status || 'sent',
      channels.email?.trace || ''
    );

    res.status(201).json({ success: true });
  } catch (error: any) {
    console.error('Error logging dispatch:', error);
    res.status(500).json({ error: 'Failed to record transmission details: ' + error.message });
  }
});

export default router;
