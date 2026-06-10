import fs from 'fs';
import path from 'path';
import postgres from 'postgres';

// Load .env file dynamically if it exists
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
  }
} catch (e) {
  console.warn('Failed to load .env file:', e);
}

// Sanitize the connection string by removing quotes, spaces, and carriage returns
const connectionString = (process.env.DATABASE_URL || '')
  .trim()
  .replace(/^['"]|['"]$/g, '');

if (connectionString) {
  try {
    // Basic verification and safe logging of the hostname (without password)
    const sanitizedUri = connectionString.includes('@') 
      ? connectionString 
      : 'postgresql://' + connectionString;
    const parsed = new URL(sanitizedUri);
    console.log(`📡 Database target: host="${parsed.hostname}" port=${parsed.port || '5432'} path="${parsed.pathname}"`);
  } catch (err) {
    console.warn('⚠️ Unable to parse DATABASE_URL structure:', err);
  }
}

// Initialize postgres client targeting Supabase safely
export const sql = connectionString 
  ? postgres(connectionString, {
      ssl: 'require',
      max: 10
    })
  : (() => {
      console.warn('⚠️ WARNING: DATABASE_URL is not set. Database queries will fail!');
      return (() => {
        throw new Error('DATABASE_URL environment variable is not defined!');
      }) as any;
    })();

// Compatibility helper & schema migration runner
export async function initDb(): Promise<void> {
  if (!connectionString) {
    console.error('❌ Error: DATABASE_URL is not defined. Skipping database migration.');
    return;
  }
  try {
    console.log('🔗 Connected to Supabase PostgreSQL database.');
    
    // 1. Core safety columns
    await sql`ALTER TABLE teachers ADD COLUMN IF NOT EXISTS approved BOOLEAN DEFAULT FALSE`;
    
    // 1.5 Student Gamification columns
    await sql`ALTER TABLE students ADD COLUMN IF NOT EXISTS xp_points INT DEFAULT 0`;
    await sql`ALTER TABLE students ADD COLUMN IF NOT EXISTS current_streak INT DEFAULT 0`;
    await sql`ALTER TABLE students ADD COLUMN IF NOT EXISTS last_active_date DATE`;

    // 2. Create parents table
    await sql`
      CREATE TABLE IF NOT EXISTS parents (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // 3. Create classes table
    await sql`
      CREATE TABLE IF NOT EXISTS classes (
        name VARCHAR(50) PRIMARY KEY,
        class_teacher_id VARCHAR(50) REFERENCES teachers(id) UNIQUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // 4. Create class_subjects table
    await sql`
      CREATE TABLE IF NOT EXISTS class_subjects (
        id SERIAL PRIMARY KEY,
        class_name VARCHAR(50) REFERENCES classes(name) ON DELETE CASCADE,
        subject_name VARCHAR(100) NOT NULL,
        teacher_id VARCHAR(50) REFERENCES teachers(id) ON DELETE CASCADE,
        CONSTRAINT unique_class_subject UNIQUE (class_name, subject_name)
      )
    `;

    // 4.5. Create board_members table
    await sql`
      CREATE TABLE IF NOT EXISTS board_members (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE,
        title VARCHAR(100),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // 4.6. Create timetable_events table
    await sql`
      CREATE TABLE IF NOT EXISTS timetable_events (
        id SERIAL PRIMARY KEY,
        class_name VARCHAR(50) REFERENCES classes(name) ON DELETE CASCADE,
        subject VARCHAR(100) NOT NULL,
        teacher_id VARCHAR(50) REFERENCES teachers(id) ON DELETE SET NULL,
        day_of_week VARCHAR(20) NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // 4.7. Create reports table
    await sql`
      CREATE TABLE IF NOT EXISTS reports (
        id SERIAL PRIMARY KEY,
        student_id VARCHAR(50) REFERENCES students(id) ON DELETE CASCADE,
        stream VARCHAR(50) NOT NULL,
        term VARCHAR(20) NOT NULL,
        year INT NOT NULL,
        teacher_comments TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (student_id, term, year)
      )
    `;

    // 4.8. Create report_grades table
    await sql`
      CREATE TABLE IF NOT EXISTS report_grades (
        id SERIAL PRIMARY KEY,
        report_id INT REFERENCES reports(id) ON DELETE CASCADE,
        subject VARCHAR(100) NOT NULL,
        score INT NOT NULL,
        grade VARCHAR(2) NOT NULL,
        UNIQUE (report_id, subject)
      )
    `;

    // 4.9. Create study_hub_messages table for collaborative learning
    await sql`
      CREATE TABLE IF NOT EXISTS study_hub_messages (
        id SERIAL PRIMARY KEY,
        stream VARCHAR(50) NOT NULL,
        sender_name VARCHAR(100) NOT NULL,
        sender_role VARCHAR(20) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // 5. Check if we need to migrate teachers stream/subject
    const columnsResult = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'teachers' AND column_name IN ('stream', 'subject')
    `;
    const hasTeacherStreamSubject = columnsResult.length > 0;

    if (hasTeacherStreamSubject) {
      console.log('Migrating streams and subjects from teachers to normalized tables...');
      
      // Get all active streams/classes from teachers
      const streams = await sql`SELECT DISTINCT stream FROM teachers WHERE stream IS NOT NULL AND stream <> ''`;
      for (const row of streams) {
        await sql`
          INSERT INTO classes (name) VALUES (${row.stream})
          ON CONFLICT (name) DO NOTHING
        `;
      }

      // Map class teachers
      await sql`
        UPDATE classes c
        SET class_teacher_id = t.id
        FROM teachers t
        WHERE t.stream = c.name AND c.class_teacher_id IS NULL
      `;

      // Map subject teachers
      const teachers = await sql`SELECT id, stream, subject FROM teachers WHERE stream IS NOT NULL AND subject IS NOT NULL`;
      for (const t of teachers) {
        await sql`
          INSERT INTO class_subjects (class_name, subject_name, teacher_id)
          VALUES (${t.stream}, ${t.subject}, ${t.id})
          ON CONFLICT (class_name, subject_name) DO NOTHING
        `;
      }
    }

    // 6. Migrate students inline guardian details to parents table
    const studentColumnsResult = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'students' AND column_name IN ('guardian_name', 'guardian_phone', 'guardian_email')
    `;
    const hasStudentGuardianColumns = studentColumnsResult.length > 0;

    if (hasStudentGuardianColumns) {
      console.log('Migrating students guardian columns to parents table...');

      // Find all unique guardians in students
      const guardians = await sql`
        SELECT DISTINCT guardian_name, guardian_phone, guardian_email 
        FROM students 
        WHERE guardian_email IS NOT NULL AND guardian_phone IS NOT NULL
      `;

      // We need to generate Parent IDs (P001, P002, etc.)
      const [countResult] = await sql`SELECT COUNT(*)::int as count FROM parents`;
      let nextIdNum = (countResult ? countResult.count : 0) + 1;

      for (const g of guardians) {
        // Check if parent already exists in database (by email or phone)
        const [existingParent] = await sql`
          SELECT id FROM parents WHERE email = ${g.guardian_email.trim().toLowerCase()} OR phone = ${g.guardian_phone.trim()}
        `;

        if (!existingParent) {
          const parentId = `P${String(nextIdNum++).padStart(3, '0')}`;
          // 'parent123' hashed
          const defaultPasswordHash = '$2b$10$yR/7n9fP36oH0x1xN9.DGeSjSefL1eG9Z4GfXmC6Rk7zF7x39s1fK';
          await sql`
            INSERT INTO parents (id, name, phone, email, password)
            VALUES (${parentId}, ${g.guardian_name.trim()}, ${g.guardian_phone.trim()}, ${g.guardian_email.trim().toLowerCase()}, ${defaultPasswordHash})
            ON CONFLICT DO NOTHING
          `;
        }
      }

      // Link students to their respective parent record
      await sql`ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_id VARCHAR(50) REFERENCES parents(id)`;

      // Update student parent_id matching on email/phone
      await sql`
        UPDATE students s
        SET parent_id = p.id
        FROM parents p
        WHERE s.guardian_email = p.email OR s.guardian_phone = p.phone
      `;

      // Set parent_id to NOT NULL
      await sql`ALTER TABLE students ALTER COLUMN parent_id SET NOT NULL`;

      // Drop old columns
      await sql`ALTER TABLE students DROP COLUMN IF EXISTS guardian_name`;
      await sql`ALTER TABLE students DROP COLUMN IF EXISTS guardian_phone`;
      await sql`ALTER TABLE students DROP COLUMN IF EXISTS guardian_email`;
    }

    // Drop teachers stream and subject columns after data is migrated
    if (hasTeacherStreamSubject) {
      await sql`ALTER TABLE teachers DROP COLUMN IF EXISTS stream`;
      await sql`ALTER TABLE teachers DROP COLUMN IF EXISTS subject`;
    }

    console.log('✅ Database schema verified and updated.');
  } catch (error) {
    console.error('❌ Error executing database migrations:', error);
  }
}
