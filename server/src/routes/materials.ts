import { Router, type Response } from 'express';
import { sql } from '../db.js';
import { authenticateToken, type AuthRequest } from '../middleware/auth.js';

const router = Router();

// GET /api/materials - Get study materials (filtered by authorId or grade)
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { authorId, grade } = req.query;

  try {
    let materials: any[] = [];
    let targetGrade = grade as string | undefined;
    let targetAuthorId = authorId as string | undefined;

    if (req.user?.role === 'student') {
      // Force students to only fetch materials of their own class grade stream
      targetGrade = req.user.stream;
      targetAuthorId = undefined;
    }

    if (targetAuthorId) {
      materials = await sql`
        SELECT m.*, t.name as author_name 
        FROM study_materials m
        JOIN teachers t ON m.author_id = t.id
        WHERE m.author_id = ${targetAuthorId}
        ORDER BY m.created_at DESC
      `;
    } else if (targetGrade) {
      materials = await sql`
        SELECT m.*, t.name as author_name 
        FROM study_materials m
        JOIN teachers t ON m.author_id = t.id
        WHERE m.grade = ${targetGrade}
        ORDER BY m.created_at DESC
      `;
    } else {
      materials = await sql`
        SELECT m.*, t.name as author_name 
        FROM study_materials m
        JOIN teachers t ON m.author_id = t.id
        ORDER BY m.created_at DESC
      `;
    }

    // Map DB column schema to frontend StudyMaterial interface fields
    const formatted = materials.map(m => ({
      id: m.id,
      title: m.title,
      subject: m.subject,
      grade: m.grade,
      author: m.author_name,
      content: m.content
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Error fetching materials:', error);
    res.status(500).json({ error: 'Failed to retrieve study documents.' });
  }
});

// POST /api/materials - Publish new document resource
router.post('/', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  const { title, subject, grade, authorId, content } = req.body;

  if (req.user?.role !== 'admin' && !(req.user?.role === 'teacher' && req.user?.id === authorId)) {
    res.status(403).json({ error: 'Access Denied: You are not authorized to publish materials on behalf of this author.' });
    return;
  }

  if (!title || !subject || !grade || !authorId || !content) {
    res.status(400).json({ error: 'Missing study notes content, title, subject or author fields.' });
    return;
  }

  try {
    // Check total materials count to auto increment ID
    const [countResult] = await sql`SELECT COUNT(*)::int as count FROM study_materials`;
    const count = countResult ? countResult.count : 0;
    const nextIdNum = count + 1;
    const newId = `M${nextIdNum < 100 ? (nextIdNum < 10 ? '0' + nextIdNum : '0' + nextIdNum) : nextIdNum}`;

    await sql`
      INSERT INTO study_materials (id, title, subject, grade, author_id, content)
      VALUES (${newId}, ${title}, ${subject}, ${grade}, ${authorId}, ${content})
    `;

    // Fetch newly created document to confirm
    const [teacher] = await sql`SELECT name FROM teachers WHERE id = ${authorId}`;

    res.status(201).json({
      success: true,
      material: {
        id: newId,
        title,
        subject,
        grade,
        author: teacher ? teacher.name : 'Unknown',
        content
      }
    });
  } catch (error: any) {
    console.error('Error publishing study material:', error);
    res.status(500).json({ error: 'Failed to write material to database: ' + error.message });
  }
});

// DELETE /api/materials/:id - Delete a study material (admin or authoring teacher)
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const [material] = await sql`SELECT id, author_id FROM study_materials WHERE id = ${id}`;

    if (!material) {
      res.status(404).json({ error: 'Study material not found.' });
      return;
    }

    // Only admin or the authoring teacher can delete
    if (req.user?.role !== 'admin' && !(req.user?.role === 'teacher' && req.user?.id === material.author_id)) {
      res.status(403).json({ error: 'Access Denied: You are not authorized to delete this material.' });
      return;
    }

    await sql`DELETE FROM study_materials WHERE id = ${id}`;

    res.json({ success: true, message: `Material ${id} deleted.` });
  } catch (error: any) {
    console.error('Error deleting material:', error);
    res.status(500).json({ error: 'Failed to delete study material: ' + error.message });
  }
});

export default router;
