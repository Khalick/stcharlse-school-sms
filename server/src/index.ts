import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import { initDb } from './db.js';

// Load .env file dynamically
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envLines = fs.readFileSync(envPath, 'utf-8').split('\n');
    envLines.forEach(line => {
      const parts = line.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim();
        if (key && !key.startsWith('#')) {
          process.env[key] = value.replace(/^['"]|['"]$/g, '');
        }
      }
    });
    console.log('Environment variables loaded from .env file.');
  }
} catch (e) {
  console.warn('Failed to load .env file:', e);
}

// Routers
import authRouter from './routes/auth.js';
import teachersRouter from './routes/teachers.js';
import attendanceRouter from './routes/attendance.js';
import materialsRouter from './routes/materials.js';
import notificationsRouter from './routes/notifications.js';
import adminRouter from './routes/admin.js';
import studentsRouter from './routes/students.js';
import aiRouter from './routes/ai.js';

const app = express();
const PORT = 3001;

// Middlewares
app.use(cors());
app.use(express.json());

// Initialize Database Tables
console.log('Bootstrapping St. Charles database schema...');
initDb();

// Mount API Endpoints
app.use('/api/auth', authRouter);
app.use('/api/teachers', teachersRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/materials', materialsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/students', studentsRouter);
app.use('/api/ai', aiRouter);

// Base Check-alive Health route
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', database: 'connected', service: 'stcharles-sms-backend' });
});

// Bootstrap listener
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🎓 ST. CHARLES SCHOOL DIGITAL BACKEND IS ACTIVE    `);
    console.log(`📶 Server environment listening on http://localhost:${PORT}`);
    console.log(`====================================================`);
  });
}

export default app;
