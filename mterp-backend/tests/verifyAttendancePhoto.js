const express = require('express');
const http = require('http');
const mongoose = require('mongoose');

// Create test express app
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mock auth middleware to supply a valid test user
const mockUser = {
  _id: new mongoose.Types.ObjectId(),
  username: 'testworker',
  role: 'site_manager',
  fullName: 'Test Worker Photo Mandatory',
};

// Override auth middleware for testing
const authMiddleware = require('../src/middleware/auth');
authMiddleware.auth = (req, res, next) => {
  req.user = mockUser;
  next();
};

const attendanceRouter = require('../src/routes/attendance');
app.use('/api/attendance', attendanceRouter);

const server = http.createServer(app);

async function runTests() {
  await mongoose.connect('mongodb://localhost:27017/mterp');
  console.log('✅ Connected to MongoDB');

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api/attendance`;
  console.log(`🧪 Test server running on ${baseUrl}`);

  let failed = false;

  // Test 1: POST /api/attendance/checkin without photo must return 400
  console.log('\n--- Test 1: Check-In without photo must return 400 Bad Request ---');
  try {
    const res = await fetch(`${baseUrl}/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: new mongoose.Types.ObjectId().toString(),
        clientTime: new Date().toISOString(),
      }),
    });
    const data = await res.json();
    console.log(`Status: ${res.status}, Body:`, data);
    if (res.status === 400 && data.msg && data.msg.includes('Foto bukti kehadiran wajib dilampirkan')) {
      console.log('✅ Test 1 PASSED: Rejected check-in with mandatory photo error.');
    } else {
      console.error('❌ Test 1 FAILED: Expected 400 with photo mandatory msg');
      failed = true;
    }
  } catch (err) {
    console.error('❌ Test 1 ERROR:', err);
    failed = true;
  }

  // Test 2: POST /api/attendance (legacy) without photo must return 400
  console.log('\n--- Test 2: Legacy Check-In without photo must return 400 Bad Request ---');
  try {
    const res = await fetch(`${baseUrl}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: new mongoose.Types.ObjectId().toString(),
      }),
    });
    const data = await res.json();
    console.log(`Status: ${res.status}, Body:`, data);
    if (res.status === 400 && data.msg && data.msg.includes('Foto bukti kehadiran wajib dilampirkan')) {
      console.log('✅ Test 2 PASSED: Rejected legacy check-in with mandatory photo error.');
    } else {
      console.error('❌ Test 2 FAILED: Expected 400 with photo mandatory msg');
      failed = true;
    }
  } catch (err) {
    console.error('❌ Test 2 ERROR:', err);
    failed = true;
  }

  // Test 3: POST /api/attendance/checkin with photoUrl passes photo validation
  console.log('\n--- Test 3: Check-In with photo passes photo validation ---');
  try {
    const res = await fetch(`${baseUrl}/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: new mongoose.Types.ObjectId().toString(),
        clientTime: '2026-10-31T09:00:00.000+07:00',
        photoUrl: 'uploads/attendance/selfie-test.jpg',
      }),
    });
    const data = await res.json();
    console.log(`Status: ${res.status}, Body:`, data);
    if ([200, 201].includes(res.status) && data.checkIn?.photo === 'uploads/attendance/selfie-test.jpg') {
      console.log('✅ Test 3 PASSED: Check-in succeeded with photo attached.');
      // Clean up test attendance
      const { Attendance } = require('../src/models');
      await Attendance.deleteOne({ _id: data._id });
    } else {
      console.error('❌ Test 3 FAILED: Unexpected response:', data);
      failed = true;
    }
  } catch (err) {
    console.error('❌ Test 3 ERROR:', err);
    failed = true;
  }

  server.close();
  await mongoose.disconnect();

  if (failed) {
    console.error('\n❌ SOME TESTS FAILED');
    process.exit(1);
  } else {
    console.log('\n🎉 ALL MANDATORY PHOTO VALIDATION TESTS PASSED 100%!');
    process.exit(0);
  }
}

runTests();
