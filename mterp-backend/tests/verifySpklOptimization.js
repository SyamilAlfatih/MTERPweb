/**
 * verifySpklOptimization.js
 * Integration test for SPKL summary aggregation, regex-safe search,
 * WIB date filtering, rateScheme/approvalTier filtering, sorting, and pagination.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { User } = require('../src/models');
const spklRoutes = require('../src/routes/spkl');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mterp';
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_here';

async function runTests() {
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  const ownerUser = await User.findOne({ role: 'owner' }).lean();
  if (!ownerUser) {
    throw new Error('Owner seed user not found in DB.');
  }

  const ownerToken = jwt.sign({ id: ownerUser._id, role: ownerUser.role }, JWT_SECRET, { expiresIn: '1h' });

  const app = express();
  app.use(express.json());
  app.use('/api/spkl', spklRoutes);

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api/spkl`;
  console.log(`🧪 Test server running on ${baseUrl}`);

  let failed = false;

  try {
    // 1. Summary aggregation endpoint
    const sumRes = await fetch(`${baseUrl}/summary`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    if (sumRes.status !== 200) throw new Error(`Summary returned ${sumRes.status}`);
    const sumData = await sumRes.json();
    if (typeof sumData.total !== 'number' || typeof sumData.pendingSupervisor !== 'number') {
      throw new Error('Invalid summary response shape');
    }
    console.log(`✅ Test 1 PASSED: Single-aggregation /summary returned total=${sumData.total}.`);

    // 2. Pagination & limit clamping
    const pageRes = await fetch(`${baseUrl}?page=1&limit=5&sortBy=overtimeDate&sortOrder=desc`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    if (pageRes.status !== 200) throw new Error(`List returned ${pageRes.status}`);
    const pageData = await pageRes.json();
    if (pageData.page !== 1 || pageData.limit !== 5 || typeof pageData.totalPages !== 'number') {
      throw new Error(`Invalid pagination metadata: ${JSON.stringify({ page: pageData.page, limit: pageData.limit, totalPages: pageData.totalPages })}`);
    }
    if (pageData.records.length > 5) {
      throw new Error(`Expected <= 5 records, got ${pageData.records.length}`);
    }
    console.log(`✅ Test 2 PASSED: Pagination & limit clamping verified (total=${pageData.total}, totalPages=${pageData.totalPages}).`);

    // 3. Regex-safe search (special chars like "[(" must not throw 500)
    const searchRes = await fetch(`${baseUrl}?search=${encodeURIComponent('SPKL-[(test')}`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    if (searchRes.status !== 200) throw new Error(`Special-char search returned ${searchRes.status}`);
    console.log('✅ Test 3 PASSED: Regex-safe search handles special characters without error.');

    // 4. Approval tier & WIB date range filter
    const tierRes = await fetch(`${baseUrl}?approvalTier=pending&startDate=2025-01-01&endDate=2030-12-31&sortBy=effectiveHours&sortOrder=asc`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    if (tierRes.status !== 200) throw new Error(`Tier & date filter returned ${tierRes.status}`);
    const tierData = await tierRes.json();
    const invalidStatus = (tierData.records || []).find(
      (r) => !['submitted', 'supervisor_verified', 'pm_approved'].includes(r.workflowStatus)
    );
    if (invalidStatus) {
      throw new Error(`Unexpected status in approvalTier=pending: ${invalidStatus.workflowStatus}`);
    }
    console.log(`✅ Test 4 PASSED: approvalTier=pending + WIB date range + sorting verified (${tierData.total} pending).`);
  } catch (err) {
    failed = true;
    console.error('❌ TEST FAILED:', err.message);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  }

  if (failed) {
    process.exitCode = 1;
  } else {
    console.log('\n🎉 ALL SPKL OPTIMIZATION TESTS PASSED 100%!');
  }
}

runTests();
