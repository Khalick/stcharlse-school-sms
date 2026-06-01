import { db, initDb } from './db.js';

console.log('Initializing database tables...');
initDb();

console.log('Seeding initial database values...');

// Clean existing data to ensure idempotent seeding
db.exec('DELETE FROM timetable_events');
db.exec('DELETE FROM study_materials');
db.exec('DELETE FROM attendance_records');
db.exec('DELETE FROM attendance_registers');
db.exec('DELETE FROM students');
db.exec('DELETE FROM teachers');
db.exec('DELETE FROM comm_logs');

// 1. Seed Teachers
const insertTeacher = db.prepare(`
  INSERT INTO teachers (id, name, email, phone, subject, stream, password)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const teachersData = [
  { id: 'T001', name: 'Teacher Agnes', email: 'agnes.w@stcharles.sc.ke', phone: '+254 721 111222', subject: 'Science', stream: 'Grade 7A', password: 'teacher123' },
  { id: 'T002', name: 'Teacher Mark', email: 'mark.o@stcharles.sc.ke', phone: '+254 722 333444', subject: 'English', stream: 'Grade 8', password: 'teacher123' },
  { id: 'T003', name: 'Teacher Beatrice', email: 'beatrice.k@stcharles.sc.ke', phone: '+254 723 555666', subject: 'Pre-Tech', stream: 'Grade 9', password: 'teacher123' }
];

for (const t of teachersData) {
  insertTeacher.run(t.id, t.name, t.email, t.phone, t.subject, t.stream, t.password);
}

// 2. Seed Students
const insertStudent = db.prepare(`
  INSERT INTO students (id, name, stream, guardian_name, guardian_phone, guardian_email, password)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const studentsData = [
  { id: 'S001', name: 'David Kamau', stream: 'Grade 7A', guardianName: 'James Kamau', guardianPhone: '+254 712 345678', guardianEmail: 'james.kamau@email.com', password: 'student123' },
  { id: 'S002', name: 'Joseph Njoroge', stream: 'Grade 7A', guardianName: 'Peter Njoroge', guardianPhone: '+254 722 987654', guardianEmail: 'peter.njo@email.com', password: 'student123' },
  { id: 'S003', name: 'Alice Wambui', stream: 'Grade 7A', guardianName: 'Mary Wambui', guardianPhone: '+254 733 111222', guardianEmail: 'mary.wambui@email.com', password: 'student123' },
  { id: 'S004', name: 'Brian Omondi', stream: 'Grade 8', guardianName: 'Sarah Omondi', guardianPhone: '+254 701 444555', guardianEmail: 'sarah.omo@email.com', password: 'student123' },
  { id: 'S005', name: 'Grace Mutua', stream: 'Grade 8', guardianName: 'John Mutua', guardianPhone: '+254 705 666777', guardianEmail: 'john.mutua@email.com', password: 'student123' },
  { id: 'S006', name: 'Kevin Kiprop', stream: 'Grade 9', guardianName: 'Paul Kiprop', guardianPhone: '+254 720 888999', guardianEmail: 'paul.kip@email.com', password: 'student123' },
  { id: 'S007', name: 'Mercy Chebet', stream: 'Grade 9', guardianName: 'Jane Chebet', guardianPhone: '+254 715 000111', guardianEmail: 'jane.chebet@email.com', password: 'student123' }
];

for (const s of studentsData) {
  insertStudent.run(s.id, s.name, s.stream, s.guardianName, s.guardianPhone, s.guardianEmail, s.password);
}

// 3. Seed Study Materials
const insertMaterial = db.prepare(`
  INSERT INTO study_materials (id, title, subject, grade, author_id, content)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const materialsData = [
  {
    id: 'M001',
    title: 'Biology: The Human Digestive System',
    subject: 'Science',
    grade: 'Grade 7A',
    authorId: 'T001',
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
  },
  {
    id: 'M002',
    title: 'Pre-Tech: Basic Hand Tools & Safety',
    subject: 'Pre-Tech',
    grade: 'Grade 9',
    authorId: 'T003',
    content: `### Pre-Technical Studies: Hand Tools and Workshop Safety
Hand tools are instruments operated by hand rather than a motor. Knowing how to use them safely is key to preventing accidents in the workshop.

#### Key Hand Tools
1. **Hammers**: Used for driving nails, breaking objects, and shaping metal. Always ensure the hammer head is tight.
2. **Screwdrivers**: Used to tighten or loosen screws. Matches the tip type (Flathead, Phillips) to the screw head.
3. **Pliers**: Used for gripping, bending, and cutting wire. Never use pliers to turn nuts; use a wrench.
4. **Saws**: Handsaws are used to cut wood or metal (hacksaw). Always saw away from your body.

#### Workshop Safety Rules
- **Rule 1**: Always wear Personal Protective Equipment (PPE) including safety goggles, closed shoes, and an apron.
- **Rule 2**: Keep tools clean and stored in their proper places when not in use.
- **Rule 3**: Never run or play in the workshop. Keep floors clear of oil spills and debris.
- **Rule 4**: If a tool breaks, report it to the teacher immediately. Do not attempt to use broken tools.`
  },
  {
    id: 'M003',
    title: 'English: Narrative Essay Writing Structure',
    subject: 'English',
    grade: 'Grade 8',
    authorId: 'T002',
    content: `### English Composition: Narrative Essay Writing
A narrative essay tells a story, usually from the writer's perspective. It must have a clear purpose and follow a logical progression of events.

#### Core Elements of a Story
1. **Plot**: The sequence of events that make up the story.
2. **Setting**: The time and place where the story happens (e.g., Thika Kiganjo during the rainy season).
3. **Characters**: The people involved in the narrative.
4. **Theme**: The central message or moral of the story.

#### Structuring Your Narrative Essay
- **The Introduction**: Set the scene, introduce the characters, and grab the reader's attention with a hook.
- **The Rising Action**: The build-up of events where tension or a conflict arises.
- **The Climax**: The turning point of the story where the conflict reaches its peak.
- **The Falling Action**: The events that follow the climax and lead to resolving the conflict.
- **The Resolution**: The final outcome of the story, summarizing what the characters learned.`
  }
];

for (const m of materialsData) {
  insertMaterial.run(m.id, m.title, m.subject, m.grade, m.authorId, m.content);
}

// 4. Seed Timetable Events
const insertEvent = db.prepare(`
  INSERT INTO timetable_events (id, teacher_id, subject, stream, start_time, end_time, room)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const timetableData = [
  { id: 'E001', teacherId: 'T003', subject: 'Pre-Tech', stream: 'Grade 9', startTime: 495, endTime: 540, room: 'Room 5 (Workshop)' },
  { id: 'E002', teacherId: 'T001', subject: 'Science', stream: 'Grade 7A', startTime: 600, endTime: 645, room: 'Room 4 (Lab)' },
  { id: 'E003', teacherId: 'T002', subject: 'English', stream: 'Grade 8', startTime: 660, endTime: 705, room: 'Room 2' },
  { id: 'E004', teacherId: 'T002', subject: 'Kiswahili', stream: 'Grade 7A', startTime: 840, endTime: 885, room: 'Room 4' },
  { id: 'E005', teacherId: 'T001', subject: 'Science', stream: 'Grade 7A', startTime: 915, endTime: 960, room: 'Room 4' }
];

for (const ev of timetableData) {
  insertEvent.run(ev.id, ev.teacherId, ev.subject, ev.stream, ev.startTime, ev.endTime, ev.room);
}

console.log('Database successfully seeded!');
process.exit(0);
