import { Router } from 'express';
import { sql } from '../db.js';

const router = Router();

// Helper to determine letter grade
function getLetterGrade(score: number): string {
  if (score >= 80) return 'A';
  if (score >= 75) return 'A-';
  if (score >= 70) return 'B+';
  if (score >= 65) return 'B';
  if (score >= 60) return 'B-';
  if (score >= 55) return 'C+';
  if (score >= 50) return 'C';
  if (score >= 45) return 'C-';
  if (score >= 40) return 'D+';
  if (score >= 35) return 'D';
  if (score >= 30) return 'D-';
  return 'E';
}

// GET /api/reports/:studentId - Get report drafts for a student
router.get('/:studentId', async (req, res): Promise<void> => {
  try {
    const { studentId } = req.params;
    const reports = await sql`
      SELECT * FROM reports 
      WHERE student_id = ${studentId}
      ORDER BY year DESC, term DESC
    `;

    // Fetch grades for each report
    for (const report of reports) {
      const grades = await sql`
        SELECT subject, score, grade 
        FROM report_grades 
        WHERE report_id = ${report.id}
      `;
      report.grades = grades;
    }

    res.json(reports);
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// POST /api/reports - Draft or Update a report
router.post('/', async (req, res): Promise<void> => {
  try {
    const { studentId, stream, term, year, comments, grades } = req.body;

    if (!studentId || !stream || !term || !year || !grades) {
      res.status(400).json({ error: 'Missing required report fields.' });
      return;
    }

    // Upsert the main report record
    const [report] = await sql`
      INSERT INTO reports (student_id, stream, term, year, teacher_comments)
      VALUES (${studentId}, ${stream}, ${term}, ${year}, ${comments || ''})
      ON CONFLICT (student_id, term, year) 
      DO UPDATE SET 
        stream = EXCLUDED.stream,
        teacher_comments = EXCLUDED.teacher_comments
      RETURNING id
    `;

    // Insert or update grades
    for (const subject of Object.keys(grades)) {
      const score = Number(grades[subject]);
      if (isNaN(score)) continue;

      const letterGrade = getLetterGrade(score);

      await sql`
        INSERT INTO report_grades (report_id, subject, score, grade)
        VALUES (${report.id}, ${subject}, ${score}, ${letterGrade})
        ON CONFLICT (report_id, subject) 
        DO UPDATE SET 
          score = EXCLUDED.score,
          grade = EXCLUDED.grade
      `;
    }

    res.status(200).json({ success: true, message: 'Report drafted successfully.' });
  } catch (error) {
    console.error('Error saving report:', error);
    res.status(500).json({ error: 'Internal server error while saving report' });
  }
});

export { router as reportRoutes };
