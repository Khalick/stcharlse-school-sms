import Database from 'better-sqlite3';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize DB inside server workspace
const dbPath = path.resolve(__dirname, '../../stcharles.db');
export const db: SqliteDatabase = new Database(dbPath);

// Configure WAL mode for efficient concurrent reads/writes
db.pragma('journal_mode = WAL');

export function initDb(): void {
  // 1. Teachers
  db.exec(`
    CREATE TABLE IF NOT EXISTS teachers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      subject TEXT NOT NULL,
      stream TEXT NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. Students
  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      stream TEXT NOT NULL,
      guardian_name TEXT NOT NULL,
      guardian_phone TEXT NOT NULL,
      guardian_email TEXT NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 3. Attendance Registers
  db.exec(`
    CREATE TABLE IF NOT EXISTS attendance_registers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL, -- YYYY-MM-DD
      session TEXT NOT NULL CHECK (session IN ('morning', 'evening')),
      teacher_id TEXT NOT NULL REFERENCES teachers(id),
      submitted_at TEXT NOT NULL, -- HH:MM timestamp
      UNIQUE(date, session, teacher_id)
    );
  `);

  // 4. Attendance Records (absent / present status per student)
  db.exec(`
    CREATE TABLE IF NOT EXISTS attendance_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      register_id INTEGER NOT NULL REFERENCES attendance_registers(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id),
      status TEXT NOT NULL CHECK (status IN ('present', 'absent')),
      UNIQUE(register_id, student_id)
    );
  `);

  // 5. Study Materials
  db.exec(`
    CREATE TABLE IF NOT EXISTS study_materials (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      subject TEXT NOT NULL,
      grade TEXT NOT NULL, -- Grade 7A, 8, 9
      author_id TEXT NOT NULL REFERENCES teachers(id),
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 6. Timetable Events
  db.exec(`
    CREATE TABLE IF NOT EXISTS timetable_events (
      id TEXT PRIMARY KEY,
      teacher_id TEXT NOT NULL REFERENCES teachers(id),
      subject TEXT NOT NULL,
      stream TEXT NOT NULL,
      start_time INTEGER NOT NULL, -- minutes from midnight
      end_time INTEGER NOT NULL,
      room TEXT NOT NULL
    );
  `);

  // 7. Communication Logs (Dispatched Alerts)
  db.exec(`
    CREATE TABLE IF NOT EXISTS comm_logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      message TEXT NOT NULL,
      whatsapp_status TEXT,
      whatsapp_trace TEXT,
      sms_status TEXT,
      sms_trace TEXT,
      email_status TEXT,
      email_trace TEXT
    );
  `);
}
