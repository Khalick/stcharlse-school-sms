# St. Charles School SMS - Comprehensive QA Checklist

## 1. Authentication & Roles
- [ ] **Admin Login**: Verify successful login using admin credentials.
- [ ] **Teacher Login**: Verify successful login using teacher credentials.
- [ ] **Student Login**: Verify successful login using student credentials.

## 2. Admin Dashboard & Communication Hub
- [ ] **Dashboard Stats**: Verify total enrollment, attendance rate, and registered stats load correctly.
- [ ] **Broadcaster Targets**: Test selecting "All Parents".
- [ ] **Broadcaster Targets**: Test selecting "Specific Grade Level".
- [ ] **Broadcaster Targets**: Test selecting "Selected Parents".
- [ ] **Broadcaster Targets**: Test selecting "All School Teachers (Staff)".
- [ ] **Broadcaster Targets**: Test selecting "School Board of Management".
- [ ] **Dispatch Broadcast**: Verify the "Dispatch 3-Channel Broadcast" button works and logs appear in the Live Carrier Terminal.

## 3. Teacher Staff Directory
- [ ] **Add Teacher**: Open the "Add New Teacher" modal.
- [ ] **Pastoral Care Assignment**: Check the "Assign as Class Teacher" box and assign a stream.
- [ ] **Academic Subject Assignment**: Click "+ Add Subject" and dynamically add multiple subjects to different streams.
- [ ] **Save Profile**: Save the teacher and ensure the table accurately displays multiple badges for subjects and the green badge for the Class Stream.

## 4. Teacher Portal (Workspaces & Registers)
- [ ] **Dynamic Dropdown**: Log in as a teacher and verify the "Active Workspace" dropdown automatically lists all assigned Class and Subject roles.
- [ ] **Access Control**: Select a "Subject" workspace and verify the Attendance Sheet is successfully restricted/locked.
- [ ] **Morning Register**: Switch to the "Class Teacher" workspace, mark some students present/absent, and submit the Morning Check-In.
- [ ] **Evening Register**: Verify the evening register successfully unlocks ONLY after the morning sheet is submitted.
- [ ] **Resource Publisher**: Navigate to "Study Resources", type some notes, and verify it automatically tags the upload with the active workspace's stream and subject.

## 5. Student Portal & Charlie AI Companion
- [ ] **Study Vault**: Log in as a student and click a study handout card to activate it.
- [ ] **Practice Quiz**: Click answers and verify the scoring system, explanations, and "Correct/Incorrect" toast notifications.
- [ ] **Syllabus Test**: Ask Charlie a syllabus-related question (e.g., "Explain the digestive system"). Verify the answer is simple, short, and child-friendly.
- [ ] **Visual Generation**: Ask Charlie "Show me an image of the digestive tract." Verify that Charlie says "I am showing you an image of..." and displays an actual image instead of raw text.
- [ ] **Audio Engine**: Click the "Listen" button on Charlie's response. Verify it uses a clear Male voice and speaks at a deliberately slower pace.
- [ ] **Microphone**: Click the "Speak" button to use Whisper audio transcription.

## 6. AI Timetable & Automation
- [ ] **Llama-3 Parsing**: In the Admin Timetable tab, paste a sample schedule text and click "Parse with Llama 3".
- [ ] **Database Saving**: Verify the parsed events show up beautifully in the grid UI, proving they saved to the database.
- [ ] **Cron Endpoints**: The cron engine is fully automated, but you can manually verify it by triggering the Vercel ping when a class is exactly 10 or 5 minutes away.
