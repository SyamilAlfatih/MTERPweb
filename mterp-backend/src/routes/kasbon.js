const express = require('express');
const bcrypt = require('bcryptjs');
const { Kasbon, User } = require('../models');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/kasbon - Get kasbon requests
router.get('/', auth, async (req, res) => {
  try {
    const { status } = req.query;
    
    let query = {};
    
    // Workers can only see their own
    if (req.user.role === 'worker') {
      query.userId = req.user._id;
    }
    
    // Filter by status
    if (status) {
      query.status = status;
    }
    
    const kasbons = await Kasbon.find(query)
      .populate('userId', 'fullName role')
      .populate('approvedBy', 'fullName')
      .sort({ createdAt: -1 });
    
    res.json(kasbons);
  } catch (error) {
    console.error('Get kasbon error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/kasbon - Create kasbon request
router.post('/', auth, async (req, res) => {
  try {
    const { amount, reason } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ msg: 'Invalid amount' });
    }
    
    if (amount > 200000) {
      return res.status(400).json({ msg: 'Maximum Kasbon limit is Rp 200.000' });
    }
    
    const kasbon = new Kasbon({
      userId: req.user._id,
      amount: Number(amount),
      reason,
    });
    
    await kasbon.save();
    await kasbon.populate('userId', 'fullName role');
    
    res.status(201).json(kasbon);
  } catch (error) {
    console.error('Create kasbon error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/kasbon/:id - Approve/reject kasbon
router.put('/:id', auth, authorize('owner', 'director'), async (req, res) => {
  try {
    const { status, rejectionReason, passphrase } = req.body;
    
    // Require passphrase verification for approvals
    if (status === 'Approved') {
      if (!passphrase || passphrase.length < 4) {
        return res.status(400).json({ msg: 'Passphrase is required (min 4 characters)' });
      }
      const user = await User.findById(req.user._id);
      if (!user) {
        return res.status(404).json({ msg: 'User not found' });
      }
      const isMatch = await bcrypt.compare(passphrase, user.password);
      if (!isMatch) {
        return res.status(400).json({ msg: 'Incorrect passphrase' });
      }
    }
    
    const updateData = { status };
    
    if (status === 'Approved') {
      updateData.approvedBy = req.user._id;
      updateData.approvedAt = new Date();
    }
    
    if (status === 'Rejected' && rejectionReason) {
      updateData.rejectionReason = rejectionReason;
    }
    
    if (status === 'Paid') {
      updateData.paidAt = new Date();
    }
    
    const kasbon = await Kasbon.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true }
    )
      .populate('userId', 'fullName role')
      .populate('approvedBy', 'fullName');
    
    if (!kasbon) {
      return res.status(404).json({ msg: 'Kasbon not found' });
    }
    
    res.json(kasbon);
  } catch (error) {
    console.error('Update kasbon error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /api/kasbon/:id - Delete kasbon (only if pending)
router.delete('/:id', auth, async (req, res) => {
  try {
    const kasbon = await Kasbon.findById(req.params.id);
    
    if (!kasbon) {
      return res.status(404).json({ msg: 'Kasbon not found' });
    }
    
    // Only creator can delete pending requests
    if (kasbon.userId.toString() !== req.user._id.toString() && req.user.role !== 'owner') {
      return res.status(403).json({ msg: 'Not authorized' });
    }
    
    if (kasbon.status !== 'Pending') {
      return res.status(400).json({ msg: 'Cannot delete non-pending kasbon' });
    }
    
    await kasbon.deleteOne();
    res.json({ msg: 'Kasbon deleted' });
  } catch (error) {
    console.error('Delete kasbon error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
