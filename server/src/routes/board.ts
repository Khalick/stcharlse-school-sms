import { Router, type Response } from 'express';
import { sql } from '../db.js';
import { authenticateToken, type AuthRequest } from '../middleware/auth.js';

const router = Router();

// GET /api/board - List all school board members
router.get('/', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Access Denied: Only administrators can view the board directory.' });
    return;
  }

  try {
    const board = await sql`SELECT * FROM board_members ORDER BY created_at ASC`;
    res.json(board);
  } catch (error) {
    console.error('Error fetching board members:', error);
    res.status(500).json({ error: 'Failed to retrieve board directory.' });
  }
});

// POST /api/board - Add a new board member
router.post('/', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Access Denied: Only administrators can add board members.' });
    return;
  }

  const { name, phone, email, title } = req.body;

  if (!name || !phone) {
    res.status(400).json({ error: 'Missing required fields (name, phone).' });
    return;
  }

  try {
    const [countResult] = await sql`SELECT COUNT(*)::int as count FROM board_members`;
    const count = countResult ? countResult.count : 0;
    const nextIdNum = count + 1;
    const newId = `B${nextIdNum < 100 ? (nextIdNum < 10 ? '00' + nextIdNum : '0' + nextIdNum) : nextIdNum}`;

    await sql`
      INSERT INTO board_members (id, name, phone, email, title)
      VALUES (${newId}, ${name}, ${phone.trim()}, ${email ? email.trim().toLowerCase() : null}, ${title || 'Board Member'})
    `;

    res.status(201).json({ success: true, member: { id: newId, name, phone, email, title } });
  } catch (error: any) {
    if (error.code === '23505') {
      res.status(409).json({ error: 'A board member with this phone or email already exists.' });
    } else {
      console.error('Error adding board member:', error);
      res.status(500).json({ error: 'Failed to add board member: ' + error.message });
    }
  }
});

// DELETE /api/board/:id - Remove a board member
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Access Denied: Only administrators can remove board members.' });
    return;
  }

  const { id } = req.params;

  try {
    const [exists] = await sql`SELECT id FROM board_members WHERE id = ${id}`;
    if (!exists) {
      res.status(404).json({ error: 'Board member not found.' });
      return;
    }

    await sql`DELETE FROM board_members WHERE id = ${id}`;
    res.json({ success: true, message: `Board member ${id} removed.` });
  } catch (error: any) {
    console.error('Error deleting board member:', error);
    res.status(500).json({ error: 'Failed to remove board member: ' + error.message });
  }
});

export default router;
