const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { ApiKey } = require('../models');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

// Owner-only route
router.use(auth);
router.use(authorize('owner'));

// GET /api/apikeys - List all API keys
router.get('/', async (req, res) => {
  try {
    const keys = await ApiKey.find({})
      .select('-keyHash')
      .populate('createdBy', 'fullName username')
      .sort({ createdAt: -1 })
      .lean();

    res.json(keys);
  } catch (error) {
    console.error('Fetch API keys error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/apikeys - Generate a new API key
router.post('/', async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ msg: 'Key name is required' });
    }

    // Generate random key: mterp_ + 40 hex chars
    const randomHex = crypto.randomBytes(20).toString('hex');
    const rawKey = `mterp_${randomHex}`;
    const keyPrefix = rawKey.slice(0, 14); // "mterp_xxxxxxxx" (14 chars)

    // Hash the raw key with bcrypt
    const keyHash = await bcrypt.hash(rawKey, 10);

    const apiKey = new ApiKey({
      name: name.trim(),
      keyHash,
      keyPrefix,
      createdBy: req.user._id,
      isActive: true,
    });

    await apiKey.save();

    // Return rawKey ONLY ONCE on creation
    res.status(201).json({
      _id: apiKey._id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      rawKey, // User must save this now
      isActive: apiKey.isActive,
      createdAt: apiKey.createdAt,
    });
  } catch (error) {
    console.error('Create API key error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/apikeys/:id - Update key (name or active status)
router.put('/:id', async (req, res) => {
  try {
    const { name, isActive } = req.body;
    const updateData = {};

    if (name !== undefined) updateData.name = name.trim();
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);

    const key = await ApiKey.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true }
    ).select('-keyHash');

    if (!key) {
      return res.status(404).json({ msg: 'API key not found' });
    }

    res.json(key);
  } catch (error) {
    console.error('Update API key error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /api/apikeys/:id - Delete an API key
router.delete('/:id', async (req, res) => {
  try {
    const key = await ApiKey.findByIdAndDelete(req.params.id);

    if (!key) {
      return res.status(404).json({ msg: 'API key not found' });
    }

    res.json({ msg: 'API key deleted successfully' });
  } catch (error) {
    console.error('Delete API key error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
