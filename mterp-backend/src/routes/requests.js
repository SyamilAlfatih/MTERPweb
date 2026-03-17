const express = require('express');
const bcrypt = require('bcryptjs');
const { Request, Project, User } = require('../models');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/requests - Get all requests (with optional status filter)
router.get('/', auth, async (req, res) => {
  try {
    const { status, projectId } = req.query;
    let query = {};
    
    // Filter by status
    if (status) {
      query.status = status;
    }
    
    // Filter by project
    if (projectId) {
      query.projectId = projectId;
    }
    
    // Non-admin users only see their own requests
    if (['worker', 'supervisor', 'asset_admin'].includes(req.user.role)) {
      query.requestedBy = req.user._id;
    }
    
    const requests = await Request.find(query)
      .populate('requestedBy', 'fullName role')
      .populate('projectId', 'nama lokasi')
      .populate('approvedBy', 'fullName')
      .sort({ createdAt: -1 });
    
    res.json(requests);
  } catch (error) {
    console.error('Get requests error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/requests/:id - Get single request
router.get('/:id', auth, async (req, res) => {
  try {
    const request = await Request.findById(req.params.id)
      .populate('requestedBy', 'fullName role')
      .populate('projectId', 'nama lokasi')
      .populate('approvedBy', 'fullName');
    
    if (!request) {
      return res.status(404).json({ msg: 'Request not found' });
    }
    
    res.json(request);
  } catch (error) {
    console.error('Get request error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/requests - Create material request
router.post('/', auth, async (req, res) => {
  try {
    const { item, qty, dateNeeded, purpose, costEstimate, projectId, urgency } = req.body;
    
    if (!item || !item.trim()) {
      return res.status(400).json({ msg: 'Item name is required' });
    }
    if (qty === undefined || qty === null || String(qty).trim() === '') {
      return res.status(400).json({ msg: 'Quantity is required' });
    }
    
    const request = new Request({
      item,
      qty,
      dateNeeded,
      purpose,
      costEstimate: Number(costEstimate) || 0,
      projectId: projectId || undefined,
      urgency: urgency || 'Normal',
      requestedBy: req.user._id,
    });
    
    await request.save();
    
    // Populate for response
    await request.populate('requestedBy', 'fullName role');
    await request.populate('projectId', 'nama lokasi');
    
    res.status(201).json(request);
  } catch (error) {
    console.error('Create request error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/requests/:id - Update request (approve/reject)
router.put('/:id', auth, authorize('owner', 'director', 'asset_admin'), async (req, res) => {
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
    }
    
    if (status === 'Rejected' && rejectionReason) {
      updateData.rejectionReason = rejectionReason;
    }
    
    const request = await Request.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true }
    )
      .populate('requestedBy', 'fullName role')
      .populate('projectId', 'nama lokasi')
      .populate('approvedBy', 'fullName');
    
    if (!request) {
      return res.status(404).json({ msg: 'Request not found' });
    }
    
    res.json(request);
  } catch (error) {
    console.error('Update request error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /api/requests/:id - Delete request
router.delete('/:id', auth, async (req, res) => {
  try {
    const request = await Request.findById(req.params.id);
    
    if (!request) {
      return res.status(404).json({ msg: 'Request not found' });
    }
    
    // Only owner or the requester can delete
    if (req.user.role !== 'owner' && request.requestedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ msg: 'Not authorized' });
    }
    
    await request.deleteOne();
    res.json({ msg: 'Request deleted' });
  } catch (error) {
    console.error('Delete request error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
