export interface Student {
  id: string;
  name: string;
  stream: string;
  guardianName: string;
  guardianPhone: string;
  guardianEmail: string;
  attendanceRate: number; // calculated
  password?: string;
}

export interface Teacher {
  id: string;
  name: string;
  email: string;
  phone: string;
  subject: string;
  stream: string;
  password?: string;
}

export interface SessionUser {
  id: string;
  name: string;
  role: 'admin' | 'teacher' | 'student';
  stream?: string;
  email?: string;
  assignments?: { className: string; subjectName: string }[];
}

export interface AttendanceRecord {
  studentId: string;
  status: 'present' | 'absent';
}

export interface DailyRegister {
  date: string; // YYYY-MM-DD
  session: 'morning' | 'evening';
  teacherId: string;
  submittedAt: string; // HH:MM or empty
  records: AttendanceRecord[];
}

export interface StudyMaterial {
  id: string;
  title: string;
  subject: string;
  grade: string;
  author: string;
  content: string;
}

export interface CommLog {
  id: string;
  timestamp: string; // virtual time
  message: string;
  channels: {
    whatsapp: { status: 'sent' | 'delivered' | 'read'; trace: string };
    sms: { status: 'queued' | 'sent' | 'failed'; trace: string };
    email: { status: 'sent' | 'delivered'; trace: string };
  };
}

export interface TimetableEvent {
  id: string;
  teacherId: string;
  subject: string;
  stream: string;
  startTime: number; // minutes from midnight (e.g. 8:15 AM = 495)
  endTime: number; // minutes from midnight
  room: string;
}

export interface DbState {
  simulatedTime: number; // minutes from midnight
  isTimeRunning: boolean;
  timeSpeed: number; // multiplier (1x, 5x, 60x, etc.)
  students: Student[];
  teachers: Teacher[];
  materials: StudyMaterial[];
  registers: DailyRegister[];
  commLogs: CommLog[];
  timetable: TimetableEvent[];
  activeRole: 'admin' | 'teacher' | 'student';
  activeTeacherId: string;
  activeStudentId: string;
  activeMaterialId: string;
  currentUser?: SessionUser | null;
}

// Initial mock seeding data - Purged generic data, preserving Grade 6 East for demonstration
const initialStudents: Student[] = [
  { id: 'S001', name: 'David Kamau', stream: 'Grade 6 East', guardianName: 'James Kamau', guardianPhone: '+254 712 345678', guardianEmail: 'james.kamau@email.com', attendanceRate: 98, password: 'student123' },
  { id: 'S002', name: 'Joseph Njoroge', stream: 'Grade 6 East', guardianName: 'Peter Njoroge', guardianPhone: '+254 722 987654', guardianEmail: 'peter.njo@email.com', attendanceRate: 92, password: 'student123' },
  { id: 'S003', name: 'Alice Wambui', stream: 'Grade 6 East', guardianName: 'Mary Wambui', guardianPhone: '+254 733 111222', guardianEmail: 'mary.wambui@email.com', attendanceRate: 96, password: 'student123' },
  { id: 'S004', name: 'Grace Mutuku', stream: 'Grade 7 Batian', guardianName: 'John Mutuku', guardianPhone: '+254 700 111222', guardianEmail: 'john.mutuku@email.com', attendanceRate: 90, password: 'student123' },
  { id: 'S005', name: 'Kevin Ochieng', stream: 'Grade 8 Lenana', guardianName: 'Sarah Ochieng', guardianPhone: '+254 711 222333', guardianEmail: 'sarah.ochieng@email.com', attendanceRate: 95, password: 'student123' },
  { id: 'S006', name: 'Faith Wanjiku', stream: 'Grade 9 Nelion', guardianName: 'Mercy Wanjiku', guardianPhone: '+254 722 333444', guardianEmail: 'mercy.w@email.com', attendanceRate: 99, password: 'student123' }
];

const initialTeachers: Teacher[] = [
  { id: 'T001', name: 'Teacher Agnes', email: 'agnes.w@stcharles.sc.ke', phone: '+254 721 111222', subject: 'Science', stream: 'Grade 6 East', password: 'teacher123' }
];

const initialMaterials: StudyMaterial[] = [
  {
    id: 'M001',
    title: 'Biology: The Human Digestive System',
    subject: 'Science',
    grade: 'Grade 6 East',
    author: 'Teacher Agnes',
    content: `### Biology Lesson: The Human Digestive System
The human digestive system consists of the gastrointestinal tract plus the accessory organs of digestion (the tongue, salivary glands, pancreas, liver, and gallbladder). Digestion involves the breakdown of food into smaller and smaller components, until they can be absorbed and assimilated into the body.

#### 1. The Mouth & Esophagus
Digestion begins in the mouth where food is chewed and mixed with saliva, which contains enzymes that break down starch. The chewed food (bolus) then travels down the esophagus via peristalsis.

#### 2. The Stomach
The stomach is a muscular sac that contains hydrochloric acid and digestive enzymes like pepsin. It churns the food into a semi-liquid mixture called chyme.

#### 3. The Liver and Gallbladder
The liver acts like a filtration machine and chemical laboratory. It cleans toxins from your blood and produces **bile**, which is stored in the gallbladder. Bile is essential for emulsifying fats, breaking them down into tiny droplets so enzymes can digest them easily.

#### 4. The Pancreas
The pancreas secretes digestive enzymes into the small intestine to break down proteins, carbohydrates, and lipids.

#### 5. Small & Large Intestine
Most digestion and nutrient absorption happens in the small intestine. The large intestine absorbs water and salts, converting waste into solid feces.`
  }
];

const initialTimetable: TimetableEvent[] = [
  { id: 'E001', teacherId: 'T001', subject: 'Science', stream: 'Grade 6 East', startTime: 495, endTime: 540, room: 'Room 4 (Lab)' },     // 8:15 AM - 9:00 AM
  { id: 'E002', teacherId: 'T001', subject: 'Science', stream: 'Grade 6 East', startTime: 600, endTime: 645, room: 'Room 4' }            // 10:00 AM - 10:45 AM
];

const STORAGE_KEY = 'stcharles_sms_db_v3';

export function getDb(): DbState {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) {
    // Seed database
    const initialDb: DbState = {
      simulatedTime: 480, // 8:00 AM
      isTimeRunning: false,
      timeSpeed: 1,
      students: initialStudents,
      teachers: initialTeachers,
      materials: initialMaterials,
      registers: [],
      commLogs: [],
      timetable: initialTimetable,
      activeRole: 'admin',
      activeTeacherId: 'T001',
      activeStudentId: 'S001',
      activeMaterialId: 'M001',
      currentUser: null
    };
    saveDb(initialDb);
    return initialDb;
  }
  
  const parsed = JSON.parse(data);
  
  // Ensure currentUser key exists
  if (parsed.currentUser === undefined) {
    parsed.currentUser = null;
    saveDb(parsed);
  }
  
  // Ensure students and teachers have passwords if loaded from old cache
  let modified = false;
  parsed.students.forEach((s: any) => {
    if (!s.password) {
      s.password = 'student123';
      modified = true;
    }
  });
  parsed.teachers.forEach((t: any) => {
    if (!t.password) {
      t.password = 'teacher123';
      modified = true;
    }
  });
  if (modified) {
    saveDb(parsed);
  }
  
  return parsed;
}

export function saveDb(db: DbState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

export function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 === 0 ? 12 : hours % 12;
  const displayMins = mins < 10 ? `0${mins}` : mins;
  const displayHoursStr = displayHours < 10 ? `0${displayHours}` : displayHours;
  return `${displayHoursStr}:${displayMins} ${ampm}`;
}

export function formatTime24(minutes: number): string {
  const hours = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  const displayHours = hours < 10 ? `0${hours}` : hours;
  const displayMins = mins < 10 ? `0${mins}` : mins;
  return `${displayHours}:${displayMins}`;
}

export function parseTime24(timeStr: string): number {
  const [hours, mins] = timeStr.split(':').map(Number);
  return hours * 60 + mins;
}
