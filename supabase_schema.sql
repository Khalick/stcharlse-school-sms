-- =====================================================================
-- 🎓 ST. CHARLES ACADEMY - SUPABASE POSTGRESQL SCHEMA
-- =====================================================================
-- This SQL script creates the full database structure on Supabase,
-- configures indexes for performance, sets up Row Level Security (RLS),
-- and seeds the initial Ivy-League quality datasets.
-- =====================================================================

-- -----------------------------------------------------
-- 1. DROP TABLES (For easy clean re-installs if needed)
-- -----------------------------------------------------
DROP TABLE IF EXISTS comm_logs CASCADE;
DROP TABLE IF EXISTS timetable_events CASCADE;
DROP TABLE IF EXISTS study_materials CASCADE;
DROP TABLE IF EXISTS attendance_records CASCADE;
DROP TABLE IF EXISTS attendance_registers CASCADE;
DROP TABLE IF EXISTS students CASCADE;
DROP TABLE IF EXISTS teachers CASCADE;

-- -----------------------------------------------------
-- 2. CREATE SCHEMAS & TABLES
-- -----------------------------------------------------

-- Table: teachers
CREATE TABLE teachers (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    subject VARCHAR(100) NOT NULL,
    stream VARCHAR(50) NOT NULL,
    password VARCHAR(255) NOT NULL,
    approved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table: students
CREATE TABLE students (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    stream VARCHAR(50) NOT NULL,
    guardian_name VARCHAR(255) NOT NULL,
    guardian_phone VARCHAR(50) NOT NULL,
    guardian_email VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table: attendance_registers
CREATE TABLE attendance_registers (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    session VARCHAR(20) NOT NULL CHECK (session IN ('morning', 'evening')),
    teacher_id VARCHAR(50) NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT,
    submitted_at VARCHAR(10) NOT NULL, -- Format: HH:MM
    CONSTRAINT unique_daily_session_teacher UNIQUE (date, session, teacher_id)
);

-- Table: attendance_records
CREATE TABLE attendance_records (
    id SERIAL PRIMARY KEY,
    register_id INTEGER NOT NULL REFERENCES attendance_registers(id) ON DELETE CASCADE,
    student_id VARCHAR(50) NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL CHECK (status IN ('present', 'absent')),
    CONSTRAINT unique_register_student UNIQUE (register_id, student_id)
);

-- Table: study_materials
CREATE TABLE study_materials (
    id VARCHAR(50) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    subject VARCHAR(100) NOT NULL,
    grade VARCHAR(50) NOT NULL, -- e.g. "Grade 7A", "Grade 8", "Grade 9"
    author_id VARCHAR(50) NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table: timetable_events
CREATE TABLE timetable_events (
    id VARCHAR(50) PRIMARY KEY,
    teacher_id VARCHAR(50) NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    subject VARCHAR(100) NOT NULL,
    stream VARCHAR(50) NOT NULL,
    start_time INTEGER NOT NULL, -- minutes from midnight (e.g., 495 = 08:15)
    end_time INTEGER NOT NULL,   -- minutes from midnight
    room VARCHAR(50) NOT NULL
);

-- Table: comm_logs (Communication & Notification Logs)
CREATE TABLE comm_logs (
    id VARCHAR(50) PRIMARY KEY,
    timestamp VARCHAR(50) NOT NULL, -- Formatted string e.g. "08:30"
    message TEXT NOT NULL,
    whatsapp_status VARCHAR(50) DEFAULT 'sent',
    whatsapp_trace TEXT,
    sms_status VARCHAR(50) DEFAULT 'sent',
    sms_trace TEXT,
    email_status VARCHAR(50) DEFAULT 'sent',
    email_trace TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------
-- 3. OPTIMIZING DATABASE INDEXES
-- -----------------------------------------------------
CREATE INDEX idx_students_search ON students (LOWER(name), LOWER(stream));
CREATE INDEX idx_registers_date_session ON attendance_registers (date, session);
CREATE INDEX idx_materials_grade ON study_materials (grade);
CREATE INDEX idx_timetable_teacher ON timetable_events (teacher_id);
CREATE INDEX idx_comm_logs_created ON comm_logs (created_at DESC);

-- -----------------------------------------------------
-- 4. SEED DATASET (Ivy League High Fidelity Baseline)
-- -----------------------------------------------------

-- Seed Teachers
INSERT INTO teachers (id, name, email, phone, subject, stream, password, approved) VALUES
('T001', 'Agnes Walter', 'agnes.w@stcharles.sc.ke', '+254 712 333444', 'Science', 'Grade 6 East', 'teacher123', true);

-- Seed Students
INSERT INTO students (id, name, stream, guardian_name, guardian_phone, guardian_email, password) VALUES
('S001', 'David Kamau', 'Grade 6 East', 'James Kamau', '+254 712 345678', 'james.kamau@email.com', 'student123'),
('S002', 'Joseph Njoroge', 'Grade 6 East', 'Peter Njoroge', '+254 722 987654', 'peter.njo@email.com', 'student123'),
('S003', 'Alice Wambui', 'Grade 6 East', 'Mary Wambui', '+254 733 111222', 'mary.wambui@email.com', 'student123'),
('S004', 'Grace Mutuku', 'Grade 7 Batian', 'John Mutuku', '+254 700 111222', 'john.mutuku@email.com', 'student123'),
('S005', 'Kevin Ochieng', 'Grade 8 Lenana', 'Sarah Ochieng', '+254 711 222333', 'sarah.ochieng@email.com', 'student123'),
('S006', 'Faith Wanjiku', 'Grade 9 Nelion', 'Mercy Wanjiku', '+254 722 333444', 'mercy.w@email.com', 'student123');

-- Seed Study Materials
INSERT INTO study_materials (id, title, subject, grade, author_id, content) VALUES
('M001', 'Biology: The Human Digestive System', 'Science', 'Grade 6 East', 'T001', '### Biology Lesson: The Human Digestive System

The human digestive system consists of the gastrointestinal tract plus the accessory organs of digestion (the tongue, salivary glands, pancreas, liver, and gallbladder). Digestion involves the breakdown of food into smaller and smaller components, until they can be absorbed and assimilated into the body.

#### 1. The Mouth & Esophagus
- Food is broken down mechanically by teeth.
- Salivary amylase begins the chemical digestion of starch.
- The swallowed bolus travels down the esophagus via peristalsis.

#### 2. The Stomach Churning
- Acidic environment (HCl pH 1.5 - 2.0) kills microbes and activates pepsin.
- Food is turned into a semi-liquid mixture called **chyme**.

#### 3. Small and Large Intestines
- Small Intestine: Primary site for nutrient absorption. Highly folded Villi increase surface area.
- Large Intestine: Absorbs remaining water and salts, consolidating waste.');

-- Seed Timetable Events
INSERT INTO timetable_events (id, teacher_id, subject, stream, start_time, end_time, room) VALUES
('E001', 'T001', 'Science & Lab', 'Grade 6 East', 495, 545, 'Science Lab 1'),
('E002', 'T001', 'Science Review', 'Grade 6 East', 660, 710, 'Grade 6 Classroom');

-- -----------------------------------------------------
-- 5. ENABLE ROW LEVEL SECURITY (RLS) FOR SUPABASE
-- -----------------------------------------------------
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE comm_logs ENABLE ROW LEVEL SECURITY;

-- Create Policies (Allow full read/write for development. Can be locked down for production)
CREATE POLICY "Public Read Access" ON teachers FOR SELECT USING (true);
CREATE POLICY "Public Read Access" ON students FOR SELECT USING (true);
CREATE POLICY "Public Read Access" ON attendance_registers FOR SELECT USING (true);
CREATE POLICY "Public Read Access" ON attendance_records FOR SELECT USING (true);
CREATE POLICY "Public Read Access" ON study_materials FOR SELECT USING (true);
CREATE POLICY "Public Read Access" ON timetable_events FOR SELECT USING (true);
CREATE POLICY "Public Read Access" ON comm_logs FOR SELECT USING (true);

-- Allow writes
CREATE POLICY "Allow All Insert/Update" ON attendance_registers FOR ALL USING (true);
CREATE POLICY "Allow All Insert/Update" ON attendance_records FOR ALL USING (true);
CREATE POLICY "Allow All Insert/Update" ON students FOR ALL USING (true);
CREATE POLICY "Allow All Insert/Update" ON study_materials FOR ALL USING (true);
CREATE POLICY "Allow All Insert/Update" ON comm_logs FOR ALL USING (true);

-- =====================================================================
-- SCHEMA BOOTSTRAP COMPLETE!
-- You can now run this SQL directly in your Supabase SQL Editor.
-- =====================================================================
