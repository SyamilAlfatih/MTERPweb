/**
 * verifyAuditLogs.js
 * Integration test for Audit Logs middleware, sensitive data redaction,
 * executive-only RBAC, immutability, and Excel export.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { AuditLog, User } = require('../src/models');
const { auditMiddleware } = require('../src/middleware/auditLogger');
const auditLogRoutes = require('../src/routes/auditLogs');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mterp';
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_here';

async function runTests() {
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  const ownerUser = await User.findOne({ role: 'owner' }).lean();
  const workerUser = await User.findOne({ role: { $in: ['worker', 'supervisor', 'asset_admin'] } }).lean();

  if (!ownerUser || !workerUser) {
    throw new Error('Required seed users (owner and non-executive) not found in DB.');
  }

  const ownerToken = jwt.sign({ id: ownerUser._id, role: ownerUser.role }, JWT_SECRET, { expiresIn: '1h' });
  const workerToken = jwt.sign({ id: workerUser._id, role: workerUser.role }, JWT_SECRET, { expiresIn: '1h' });

  const app = express();
  app.use(express.json());
  app.use(auditMiddleware);

  // Test mutation endpoint with sensitive fields
  app.post('/api/test-audit/action', (req, res) => {
    req.user = ownerUser;
    res.locals.auditSummary = 'Test sensitive payload redaction';
    res.status(201).json({ ok: true });
  });

  app.use('/api/audit-logs', auditLogRoutes);

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`🧪 Test server running on ${baseUrl}`);

  const createdLogIds = [];
  let failed = false;

  try {
    // 1. Trigger mutation with sensitive fields
    const mutRes = await fetch(`${baseUrl}/api/test-audit/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'audit_tester',
        password: 'SuperSecretPassword123!',
        nested: { otp: '998877', token: 'jwt-secret-token' },
      }),
    });
    if (mutRes.status !== 201) throw new Error(`Expected 201, got ${mutRes.status}`);

    // Wait briefly for async res.on('finish') DB write
    await new Promise((r) => setTimeout(r, 300));

    const latestLog = await AuditLog.findOne({ summary: 'Test sensitive payload redaction' })
      .sort({ createdAt: -1 })
      .lean();
    if (!latestLog) throw new Error('AuditLog entry was not created');
    createdLogIds.push(latestLog._id);

    const payload = latestLog.changes?.payload;
    if (
      payload?.password !== '[REDACTED]' ||
      payload?.nested?.otp !== '[REDACTED]' ||
      payload?.nested?.token !== '[REDACTED]'
    ) {
      throw new Error(`Sensitive fields were NOT redacted: ${JSON.stringify(payload)}`);
    }
    console.log('✅ Test 1 PASSED: Mutation logged & sensitive fields redacted ([REDACTED]).');

    // 2. Non-executive RBAC check (must be 403 Forbidden)
    const workerRes = await fetch(`${baseUrl}/api/audit-logs`, {
      headers: { Authorization: `Bearer ${workerToken}` },
    });
    if (workerRes.status !== 403) {
      throw new Error(`Expected 403 for non-executive role (${workerUser.role}), got ${workerRes.status}`);
    }
    console.log(`✅ Test 2 PASSED: Non-executive role (${workerUser.role}) blocked with 403 Forbidden.`);

    // 3. Executive access check (owner -> 200 OK)
    const ownerRes = await fetch(`${baseUrl}/api/audit-logs?limit=10`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    if (ownerRes.status !== 200) throw new Error(`Expected 200 for owner, got ${ownerRes.status}`);
    const ownerData = await ownerRes.json();
    if (!Array.isArray(ownerData.logs) || ownerData.logs.length === 0) {
      throw new Error('Expected non-empty audit logs list');
    }
    console.log(`✅ Test 3 PASSED: Owner fetched ${ownerData.logs.length} audit logs successfully.`);

    // 4. Stats endpoint check
    const statsRes = await fetch(`${baseUrl}/api/audit-logs/stats`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    if (statsRes.status !== 200) throw new Error(`Expected 200 for stats, got ${statsRes.status}`);
    const statsData = await statsRes.json();
    if (typeof statsData.totalLogs !== 'number' || typeof statsData.todayLogs !== 'number') {
      throw new Error('Invalid stats response shape');
    }
    console.log('✅ Test 4 PASSED: Executive audit stats endpoint verified.');

    // 5. Immutability check (no DELETE / PUT allowed)
    const delRes = await fetch(`${baseUrl}/api/audit-logs/${latestLog._id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    if (delRes.status !== 404) {
      throw new Error(`Expected 404 on DELETE /api/audit-logs/:id, got ${delRes.status}`);
    }
    console.log('✅ Test 5 PASSED: Audit logs are immutable (DELETE not permitted).');

    // 6. Excel export check
    const exportRes = await fetch(`${baseUrl}/api/audit-logs/export/excel`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    if (exportRes.status !== 200) throw new Error(`Expected 200 on Excel export, got ${exportRes.status}`);
    const buf = await exportRes.arrayBuffer();
    if (buf.byteLength < 1000) throw new Error('Excel export returned unexpectedly small buffer');
    console.log(`✅ Test 6 PASSED: Excel export generated ${buf.byteLength} bytes.`);
  } catch (err) {
    failed = true;
    console.error('❌ TEST FAILED:', err.message);
  } finally {
    // Cleanup test log entries directly via Mongoose
    if (createdLogIds.length > 0) {
      await AuditLog.deleteMany({ _id: { $in: createdLogIds } });
    }
    await AuditLog.deleteMany({ module: 'audit-logs', action: 'EXPORT', actorId: ownerUser._id });
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  }

  if (failed) {
    process.exit(1);
  } else {
    console.log('\n🎉 ALL AUDIT LOGS VERIFICATION TESTS PASSED 100%!');
    process.exit(0);
  }
}

runTests();

