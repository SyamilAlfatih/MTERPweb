const express = require('express');
const { User } = require('../models');
const apiKeyAuth = require('../middleware/apiKeyAuth');

const router = express.Router();

// All routes here require valid API Key
router.use(apiKeyAuth);

// Fields to select (exclude sensitive data)
const PEKERJA_FIELDS = [
  'fullName',
  'username',
  'email',
  'role',
  'position',
  'employmentType',
  'contractStartDate',
  'contractEndDate',
  'phone',
  'address',
  'emergencyContact',
  'paymentInfo',
  'bpjsTk',
  'bpjsKesehatan',
  'isVerified',
  'profileImage',
  'createdAt',
].join(' ');

// Helper to build search/filter query
const buildQuery = (query) => {
  const { search, role, employmentType } = query;
  const filter = {};

  if (search) {
    const searchRegex = new RegExp(search.trim(), 'i');
    filter.$or = [
      { fullName: searchRegex },
      { username: searchRegex },
      { email: searchRegex },
      { phone: searchRegex },
      { position: searchRegex },
      { bpjsTk: searchRegex },
      { bpjsKesehatan: searchRegex },
    ];
  }

  if (role) {
    filter.role = role;
  }

  if (employmentType) {
    filter.employmentType = employmentType;
  }

  return filter;
};

// GET /api/pekerja - List workers with pagination and filters
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const filter = buildQuery(req.query);

    const [workers, total] = await Promise.all([
      User.find(filter)
        .select(PEKERJA_FIELDS)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    res.json({
      data: workers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    console.error('Fetch pekerja error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/pekerja/export - Export all matching workers as JSON (for bulk sync)
router.get('/export', async (req, res) => {
  try {
    const filter = buildQuery(req.query);

    const workers = await User.find(filter)
      .select(PEKERJA_FIELDS)
      .sort({ fullName: 1 })
      .lean();

    res.json({
      total: workers.length,
      data: workers,
    });
  } catch (error) {
    console.error('Export pekerja error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/pekerja/:id - Get worker details by ID
router.get('/:id', async (req, res) => {
  try {
    const worker = await User.findById(req.params.id)
      .select(PEKERJA_FIELDS)
      .lean();

    if (!worker) {
      return res.status(404).json({ msg: 'Worker not found' });
    }

    res.json(worker);
  } catch (error) {
    console.error('Fetch pekerja by id error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ msg: 'Invalid worker ID' });
    }
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
