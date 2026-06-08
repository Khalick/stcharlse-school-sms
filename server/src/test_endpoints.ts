import { hashPassword } from './lib/crypto.js';
import { sql } from './db.js';

async function runTests() {
  console.log('🧪 Starting Automated API Integration Tests...');
  const baseUrl = 'http://localhost:3001';

  try {
    // 1. Admin Login
    console.log('\n🔑 Testing Admin Login...');
    const adminLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'admin', username: 'charlie@61', password: 'admin@61' })
    });
    if (!adminLoginRes.ok) throw new Error('Admin login failed');
    const { token: adminToken } = await adminLoginRes.json();
    console.log('✅ Admin authenticated successfully.');

    // 2. Student Registration with Deduplication
    console.log('\n👥 Registering first student (Deduplication Test Student)...');
    const student1Res = await fetch(`${baseUrl}/api/students`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        name: 'Deduplication Test Student',
        stream: 'Grade 7A',
        guardianName: 'James Kamau',
        guardianPhone: '+254 712 345678',
        guardianEmail: 'james.kamau@email.com'
      })
    });
    if (!student1Res.ok) throw new Error(`Failed to create student 1: ${await student1Res.text()}`);
    const student1 = await student1Res.json();
    console.log(`✅ Student 1 created with ID: ${student1.id}`);

    // Verify parent table status
    const parentCountBefore = await sql`SELECT count(*) FROM parents`;
    console.log(`ℹ️ Parents count in database: ${parentCountBefore[0].count}`);

    // 3. Register Second Student with Name Mismatch
    console.log('\n👥 Registering second student with mismatching parent name (James K. Kamau)...');
    const student2Res = await fetch(`${baseUrl}/api/students`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        name: 'Another Student',
        stream: 'Grade 8',
        guardianName: 'James K. Kamau',
        guardianPhone: '+254 712 345678',
        guardianEmail: 'james.kamau@email.com'
      })
    });
    if (!student2Res.ok) throw new Error(`Failed to create student 2: ${await student2Res.text()}`);
    const student2 = await student2Res.json();
    console.log(`✅ Student 2 created with ID: ${student2.id}`);

    // Check parent count again (should remain the same since parent details were deduplicated)
    const parentCountAfter = await sql`SELECT count(*) FROM parents`;
    console.log(`ℹ️ Parents count after registration: ${parentCountAfter[0].count}`);
    if (parentCountBefore[0].count !== parentCountAfter[0].count) {
      throw new Error('Failure: Duplicate parent record created instead of reusing the existing one!');
    }
    console.log('✅ Parent deduplication successful: No duplicate parent record created.');

    // Verify parent name was NOT updated to 'James K. Kamau' (retains original name)
    const [parentRecord] = await sql`SELECT name FROM parents WHERE email = 'james.kamau@email.com'`;
    console.log(`ℹ️ Parent name in database: "${parentRecord.name}"`);
    if (parentRecord.name !== 'James Kamau') {
      throw new Error('Failure: Parent name was overwritten by the mismatching name!');
    }
    console.log('✅ Parent Name resilience successful: Kept existing name "James Kamau".');

    // 4. Delete Student 2 and verify notification
    console.log(`\n🗑️ Deleting student 2 (${student2.id})...`);
    const deleteRes = await fetch(`${baseUrl}/api/students/${student2.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    if (!deleteRes.ok) throw new Error(`Delete failed: ${await deleteRes.text()}`);
    console.log('✅ Student 2 deleted.');

    // Verify admin notification was created
    const notifications = await sql`SELECT * FROM comm_logs ORDER BY id DESC LIMIT 5`;
    const deleteNotice = notifications.find(n => n.message.includes('System Notice') && n.message.includes('James Kamau'));
    if (!deleteNotice) {
      throw new Error('Failure: Delete notification was not created in the communication logs!');
    }
    console.log(`✅ Deletion Notice verified in database logs: "${deleteNotice.message}"`);

    // 5. Test Teacher Logins and Role Adaptations
    console.log('\n🔑 Testing Teacher Mark Login...');
    const teacherLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'teacher', email: 'mark.o@stcharles.sc.ke', password: 'teacher123' })
    });
    if (!teacherLoginRes.ok) throw new Error('Teacher login failed');
    const teacherData = await teacherLoginRes.json();
    const teacherToken = teacherData.token;
    console.log('✅ Teacher Mark authenticated successfully.');
    console.log('ℹ️ Assigned workspaces for Teacher Mark:', teacherData.user.assignments);

    // Test Subject Teacher student list retrieval (Grade 7A - Mark teaches Kiswahili there, but is not Class Teacher)
    console.log('\n🔒 Fetching students for Grade 7A (Subject Teacher role)...');
    const list7ARes = await fetch(`${baseUrl}/api/teachers/T002/students?stream=Grade+7A`, {
      headers: { 'Authorization': `Bearer ${teacherToken}` }
    });
    if (!list7ARes.ok) throw new Error('Failed to retrieve students list for Grade 7A');
    const students7A = await list7ARes.json();
    console.log(`ℹ️ Retrieved ${students7A.length} students.`);

    // Verify contacts are masked
    const sampleStu7A = students7A.find((s: any) => s.id === 'S001');
    if (!sampleStu7A) throw new Error('Student S001 not found in Grade 7A roster');
    console.log(`ℹ️ Student S001 Roster details as Subject Teacher:
       Name: ${sampleStu7A.name}
       Guardian Name: ${sampleStu7A.guardianName}
       Guardian Phone: ${sampleStu7A.guardianPhone}
       Guardian Email: ${sampleStu7A.guardianEmail}
       isReadOnly: ${sampleStu7A.isReadOnly}`);

    if (!sampleStu7A.guardianPhone.includes('*') || !sampleStu7A.guardianEmail.includes('*')) {
      throw new Error('Failure: Parent contacts were not masked for the Subject Teacher!');
    }
    if (sampleStu7A.isReadOnly !== true) {
      throw new Error('Failure: Student roster is not marked as read-only for the Subject Teacher!');
    }
    console.log('✅ Subject Teacher roster rules verified successfully (Masked contacts + readOnly).');

    // Test Class Teacher student list retrieval (Grade 8 - Mark is Class Teacher of Grade 8)
    console.log('\n🔓 Fetching students for Grade 8 (Class Teacher role)...');
    const list8Res = await fetch(`${baseUrl}/api/teachers/T002/students?stream=Grade+8`, {
      headers: { 'Authorization': `Bearer ${teacherToken}` }
    });
    if (!list8Res.ok) throw new Error('Failed to retrieve students list for Grade 8');
    const students8 = await list8Res.json();
    
    const sampleStu8 = students8.find((s: any) => s.id === 'S004');
    if (!sampleStu8) throw new Error('Student S004 not found in Grade 8 roster');
    console.log(`ℹ️ Student S004 Roster details as Class Teacher:
       Name: ${sampleStu8.name}
       Guardian Name: ${sampleStu8.guardianName}
       Guardian Phone: ${sampleStu8.guardianPhone}
       Guardian Email: ${sampleStu8.guardianEmail}
       isReadOnly: ${sampleStu8.isReadOnly}`);

    if (sampleStu8.guardianPhone.includes('*') || sampleStu8.guardianEmail.includes('*')) {
      throw new Error('Failure: Parent contacts are masked for their own Class Teacher!');
    }
    if (sampleStu8.isReadOnly !== false) {
      throw new Error('Failure: Class Teacher roster is incorrectly marked as read-only!');
    }
    console.log('✅ Class Teacher roster rules verified successfully (Unmasked contacts + editable).');

    console.log('\n🎉 ALL INTEGRATION TESTS PASSED SUCCESSFULLY! 🎉');
    process.exit(0);
  } catch (err: any) {
    console.error('\n❌ INTEGRATION TEST FAILED:', err.message);
    process.exit(1);
  }
}

runTests();
