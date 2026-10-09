const express = require('express');
const bcrypt = require('bcryptjs');
const { Kasbon, User } = require('../models');
const { auth, authorize } = require('../middleware/auth');
const { notify, notifyByRole } = require('../utils/notify');
const whatsappGateway = require('../services/whatsappGateway');
const whatsappTemplates = require('../utils/whatsappTemplates');

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
    await kasbon.populate('userId', 'fullName role phone');
    
    res.status(201).json(kasbon);

    // 1. In-app & Web Push notification to managers (fire-and-forget)
    notifyByRole(
      ['owner', 'director'],
      {
        type: 'general',
        title: 'New Kasbon Request',
        message: `${kasbon.userId?.fullName || 'A user'} requested Rp ${Number(amount).toLocaleString('id-ID')} advance`,
        data: { kasbonId: kasbon._id },
      },
      req.user._id.toString()
    ).catch(console.error);

    // 2. WhatsApp dispatch to Finance Department (fire-and-forget)
    const waFinanceMemo = whatsappTemplates.formatKasbonAlert(kasbon, 'submitted');
    whatsappGateway
      .sendToDepartment('Finance', waFinanceMemo, {
        groupId: process.env.WA_FINANCE_GROUP_ID,
        metadata: { kasbonId: kasbon._id.toString(), event: 'submitted' },
      })
      .catch((waErr) => console.warn('[WA Finance Kasbon Error]:', waErr.message));
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
      .populate('userId', 'fullName role phone')
      .populate('approvedBy', 'fullName');
    
    if (!kasbon) {
      return res.status(404).json({ msg: 'Kasbon not found' });
    }
    
    res.json(kasbon);

    // Notify the kasbon requester about approval/rejection (fire-and-forget)
    if ((status === 'Approved' || status === 'Rejected') && kasbon.userId) {
      const recipientId = typeof kasbon.userId === 'object' ? kasbon.userId._id : kasbon.userId;
      
      // 1. In-app & Web Push notification
      notify({
        recipient: recipientId,
        type: status === 'Approved' ? 'kasbon_approved' : 'kasbon_rejected',
        title: status === 'Approved' ? 'Kasbon Approved' : 'Kasbon Rejected',
        message: status === 'Approved'
          ? `Your kasbon of Rp ${kasbon.amount?.toLocaleString('id-ID')} has been approved`
          : `Your kasbon request was rejected${rejectionReason ? ': ' + rejectionReason : ''}`,
        data: { kasbonId: kasbon._id },
      }).catch(console.error);

      // 2. WhatsApp Direct Alert to Requester (if phone registered)
      const userPhone = typeof kasbon.userId === 'object' ? kasbon.userId.phone : null;
      if (userPhone) {
        const waUserMemo = status === 'Approved'
          ? `💰 *KASBON DISETUJUI*\nPT MEGA TAMA ENERCO — MTERP\n\nPengajuan kasbon Anda sebesar *${whatsappTemplates.formatRupiah(kasbon.amount)}* telah disetujui.\nSilakan konfirmasi ke bagian Keuangan untuk proses pencairan.`
          : `❌ *KASBON DITOLAK*\nPT MEGA TAMA ENERCO — MTERP\n\nPengajuan kasbon Anda sebesar *${whatsappTemplates.formatRupiah(kasbon.amount)}* tidak dapat disetujui.\nAlasan: ${rejectionReason || 'Tidak ada catatan'}`;
        
        whatsappGateway
          .sendToUser(userPhone, waUserMemo)
          .catch((waErr) => console.warn('[WA Kasbon Requester Error]:', waErr.message));
      }

      // 3. WhatsApp Alert to Finance Desk on Approval
      if (status === 'Approved') {
        const waFinanceMemo = whatsappTemplates.formatKasbonAlert(kasbon, 'approved');
        whatsappGateway
          .sendToDepartment('Finance', waFinanceMemo, {
            groupId: process.env.WA_FINANCE_GROUP_ID,
            metadata: { kasbonId: kasbon._id.toString(), event: 'approved' },
          })
          .catch((waErr) => console.warn('[WA Kasbon Finance Approval Error]:', waErr.message));
      }
    }
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
