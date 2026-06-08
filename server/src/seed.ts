import { sql, initDb } from './db.js';
import { hashPassword } from './lib/crypto.js';

async function seed() {
  try {
    console.log('Initializing database schema...');
    await initDb();

    console.log('Cleaning existing data...');
    await sql`TRUNCATE TABLE comm_logs, timetable_events, study_materials, attendance_records, attendance_registers, students, teachers, parents, classes, class_subjects CASCADE`;

    console.log('Seeding initial database values...');

    // 1. Seed Teachers
    const teachersData = [
      { id: 'T001', name: 'Teacher Agnes', email: 'agnes.w@stcharles.sc.ke', phone: '+254 721 111222', password: 'teacher123' },
      { id: 'T002', name: 'Teacher Mark', email: 'mark.o@stcharles.sc.ke', phone: '+254 722 333444', password: 'teacher123' },
      { id: 'T003', name: 'Teacher Beatrice', email: 'beatrice.k@stcharles.sc.ke', phone: '+254 723 555666', password: 'teacher123' }
    ];

    for (const t of teachersData) {
      const hashedPassword = hashPassword(t.password);
      await sql`
        INSERT INTO teachers (id, name, email, phone, password, approved)
        VALUES (${t.id}, ${t.name}, ${t.email}, ${t.phone}, ${hashedPassword}, true)
      `;
    }

    // 2. Seed Classes
    const classesData = [
      { name: 'Grade 7A', classTeacherId: 'T001' },
      { name: 'Grade 8', classTeacherId: 'T002' },
      { name: 'Grade 9', classTeacherId: 'T003' }
    ];

    for (const c of classesData) {
      await sql`
        INSERT INTO classes (name, class_teacher_id)
        VALUES (${c.name}, ${c.classTeacherId})
      `;
    }

    // 3. Seed Class Subjects
    const classSubjectsData = [
      { className: 'Grade 7A', subjectName: 'Science', teacherId: 'T001' },
      { className: 'Grade 7A', subjectName: 'Kiswahili', teacherId: 'T002' },
      { className: 'Grade 8', subjectName: 'English', teacherId: 'T002' },
      { className: 'Grade 9', subjectName: 'Pre-Tech', teacherId: 'T003' }
    ];

    for (const cs of classSubjectsData) {
      await sql`
        INSERT INTO class_subjects (class_name, subject_name, teacher_id)
        VALUES (${cs.className}, ${cs.subjectName}, ${cs.teacherId})
      `;
    }

    // 4. Seed Parents
    const parentsData = [
      { id: 'P001', name: 'James Kamau', phone: '+254 712 345678', email: 'james.kamau@email.com', password: 'parent123' },
      { id: 'P002', name: 'Peter Njoroge', phone: '+254 722 987654', email: 'peter.njo@email.com', password: 'parent123' },
      { id: 'P003', name: 'Mary Wambui', phone: '+254 733 111222', email: 'mary.wambui@email.com', password: 'parent123' },
      { id: 'P004', name: 'Sarah Omondi', phone: '+254 701 444555', email: 'sarah.omo@email.com', password: 'parent123' },
      { id: 'P005', name: 'John Mutua', phone: '+254 705 666777', email: 'john.mutua@email.com', password: 'parent123' },
      { id: 'P006', name: 'Paul Kiprop', phone: '+254 720 888999', email: 'paul.kip@email.com', password: 'parent123' },
      { id: 'P007', name: 'Jane Chebet', phone: '+254 715 000111', email: 'jane.chebet@email.com', password: 'parent123' }
    ];

    for (const p of parentsData) {
      const hashedPassword = hashPassword(p.password);
      await sql`
        INSERT INTO parents (id, name, phone, email, password)
        VALUES (${p.id}, ${p.name}, ${p.phone}, ${p.email}, ${hashedPassword})
      `;
    }

    // 5. Seed Students
    const studentsData = [
      { id: 'S001', name: 'David Kamau', stream: 'Grade 7A', parentId: 'P001', password: 'student123' },
      { id: 'S002', name: 'Joseph Njoroge', stream: 'Grade 7A', parentId: 'P002', password: 'student123' },
      { id: 'S003', name: 'Alice Wambui', stream: 'Grade 7A', parentId: 'P003', password: 'student123' },
      { id: 'S004', name: 'Brian Omondi', stream: 'Grade 8', parentId: 'P004', password: 'student123' },
      { id: 'S005', name: 'Grace Mutua', stream: 'Grade 8', parentId: 'P005', password: 'student123' },
      { id: 'S006', name: 'Kevin Kiprop', stream: 'Grade 9', parentId: 'P006', password: 'student123' },
      { id: 'S007', name: 'Mercy Chebet', stream: 'Grade 9', parentId: 'P007', password: 'student123' }
    ];

    for (const s of studentsData) {
      const hashedPassword = hashPassword(s.password);
      await sql`
        INSERT INTO students (id, name, stream, parent_id, password)
        VALUES (${s.id}, ${s.name}, ${s.stream}, ${s.parentId}, ${hashedPassword})
      `;
    }

    // 6. Seed Study Materials
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
      await sql`
        INSERT INTO study_materials (id, title, subject, grade, author_id, content)
        VALUES (${m.id}, ${m.title}, ${m.subject}, ${m.grade}, ${m.authorId}, ${m.content})
      `;
    }

    // 7. Seed Timetable Events
    const timetableData = [
      { id: 'E001', teacherId: 'T003', subject: 'Pre-Tech', stream: 'Grade 9', startTime: 495, endTime: 540, room: 'Room 5 (Workshop)' },
      { id: 'E002', teacherId: 'T001', subject: 'Science', stream: 'Grade 7A', startTime: 600, endTime: 645, room: 'Room 4 (Lab)' },
      { id: 'E003', teacherId: 'T002', subject: 'English', stream: 'Grade 8', startTime: 660, endTime: 705, room: 'Room 2' },
      { id: 'E004', teacherId: 'T002', subject: 'Kiswahili', stream: 'Grade 7A', startTime: 840, endTime: 885, room: 'Room 4' },
      { id: 'E005', teacherId: 'T001', subject: 'Science', stream: 'Grade 7A', startTime: 915, endTime: 960, room: 'Room 4' }
    ];

    for (const ev of timetableData) {
      await sql`
        INSERT INTO timetable_events (id, teacher_id, subject, stream, start_time, end_time, room)
        VALUES (${ev.id}, ${ev.teacherId}, ${ev.subject}, ${ev.stream}, ${ev.startTime}, ${ev.endTime}, ${ev.room})
      `;
    }

    console.log('Database successfully seeded!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
}

seed();
