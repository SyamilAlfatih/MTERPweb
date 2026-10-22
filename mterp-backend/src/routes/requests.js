const express = require('express');
const bcrypt = require('bcryptjs');
const { Request, Project, User, Supply, RABItem, ProjectTask, ProcurementConfig } = require('../models');
const { auth, authorize } = require('../middleware/auth');
const { notify, notifyByRole, notifyUserWithWA } = require('../utils/notify');
const { withTransaction } = require('../utils/transaction');
const upload = require('../middleware/upload');
const { generatePrNumber, generatePoNumber } = require('../utils/procurementNumbering');
const whatsappGateway = require('../services/whatsappGateway');
const whatsappTemplates = require('../utils/whatsappTemplates');

const router = express.Router();

// Helper to populate complete procurement order details
function populateProcurement(query) {
  return query
    .populate('requestedBy', 'fullName role phone nik')
    .populate('projectId', 'nama lokasi')
    .populate('approvedBy', 'fullName role')
    .populate('reviewedBy.user', 'fullName role')
    .populate('opsApprovedBy.user', 'fullName role')
    .populate('financeApprovedBy.user', 'fullName role')
    .populate('assignedReviewerId', 'fullName role phone email')
    .populate('assignedOpsApproverId', 'fullName role phone email')
    .populate('assignedFinanceApproverId', 'fullName role phone email')
    .populate('deliveryProof.receivedBy', 'fullName role')
    .populate('paymentConfirmation.confirmedBy', 'fullName role')
    .populate('items.rabItemId', 'wbsCode description unitRate unitOfMeasure budgetedQuantity committedQuantity realizedQuantity');
}

// GET /api/requests/config - Get company-wide global approver routing policy
router.get('/config', auth, async (req, res) => {
  try {
    let config = await ProcurementConfig.findOne({ key: 'global' })
      .populate('defaultReviewerId', 'fullName role email phone')
      .populate('defaultOpsApproverId', 'fullName role email phone')
      .populate('defaultFinanceApproverId', 'fullName role email phone')
      .lean();

    if (!config) {
      config = {
        key: 'global',
        defaultReviewerId: null,
        defaultOpsApproverId: null,
        defaultFinanceApproverId: null,
        autoAssignEnabled: true,
      };
    }

    res.json(config);
  } catch (error) {
    console.error('Get procurement config error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/requests/config - Update company-wide global approver routing policy (Owner Only)
router.put('/config', auth, authorize('owner'), async (req, res) => {
  try {
    const { defaultReviewerId, defaultOpsApproverId, defaultFinanceApproverId, autoAssignEnabled } = req.body;

    let config = await ProcurementConfig.findOne({ key: 'global' });
    if (!config) {
      config = new ProcurementConfig({ key: 'global' });
    }

    if (defaultReviewerId !== undefined) config.defaultReviewerId = defaultReviewerId || undefined;
    if (defaultOpsApproverId !== undefined) config.defaultOpsApproverId = defaultOpsApproverId || undefined;
    if (defaultFinanceApproverId !== undefined) config.defaultFinanceApproverId = defaultFinanceApproverId || undefined;
    if (autoAssignEnabled !== undefined) config.autoAssignEnabled = Boolean(autoAssignEnabled);
    config.updatedBy = req.user._id;

    await config.save();

    const populated = await ProcurementConfig.findById(config._id)
      .populate('defaultReviewerId', 'fullName role email phone')
      .populate('defaultOpsApproverId', 'fullName role email phone')
      .populate('defaultFinanceApproverId', 'fullName role email phone')
      .lean();

    res.json(populated);
  } catch (error) {
    console.error('Update procurement config error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/requests/authorizers - Get candidate users configured for Reviewer, Ops Approver, Finance Approver (Owner Only)
router.get('/authorizers', auth, authorize('owner'), async (req, res) => {
  try {
    const allUsers = await User.find({ isVerified: true })
      .select('_id fullName role position department email phone')
      .sort({ fullName: 1 })
      .lean();

    const reviewers = allUsers.filter((u) =>
      ['supervisor', 'site_manager', 'foreman', 'admin_project', 'director', 'operational_director', 'owner'].includes(u.role)
    );
    const opsApprovers = allUsers.filter((u) =>
      ['operational_director', 'director', 'president_director', 'owner', 'site_manager'].includes(u.role)
    );
    const financeApprovers = allUsers.filter((u) =>
      ['director', 'president_director', 'owner'].includes(u.role)
    );

    res.json({
      all: allUsers,
      reviewers,
      opsApprovers,
      financeApprovers,
    });
  } catch (error) {
    console.error('Get authorizers error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/requests - Get all requests / procurement orders (with filters)
router.get('/', auth, async (req, res) => {
  try {
    const { status, projectId, search } = req.query;
    let query = {};

    // Filter by status (supports comma-separated list e.g. "PR_PENDING,PR_REVIEWED")
    if (status) {
      if (status.includes(',')) {
        query.status = { $in: status.split(',').map((s) => s.trim()) };
      } else {
        query.status = status;
      }
    }

    // Filter by project
    if (projectId) {
      query.projectId = projectId;
    }

    // Search query by PR Number, PO Number, or Item name
    if (search) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { prNumber: searchRegex },
        { poNumber: searchRegex },
        { item: searchRegex },
        { 'items.item': searchRegex },
      ];
    }

    // Workers and helpers only see their own requests; supervisors, directors, asset admins see all
    if (['worker', 'tukang', 'helper'].includes(req.user.role)) {
      query.requestedBy = req.user._id;
    }

    const requests = await populateProcurement(
      Request.find(query).sort({ createdAt: -1 })
    ).lean();

    res.json(requests);
  } catch (error) {
    console.error('Get requests error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/requests/:id - Get single procurement order
router.get('/:id', auth, async (req, res) => {
  try {
    const request = await populateProcurement(Request.findById(req.params.id)).lean();

    if (!request) {
      return res.status(404).json({ msg: 'Request not found' });
    }

    res.json(request);
  } catch (error) {
    console.error('Get request error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/requests - Create Purchase Request (Supports Multi-Item & Legacy Single-Item)
router.post('/', auth, async (req, res) => {
  try {
    const {
      projectId,
      dateNeeded,
      urgency,
      purpose,
      items: incomingItems,
      assignedReviewerId: reqReviewerId,
      assignedOpsApproverId: reqOpsId,
      assignedFinanceApproverId: reqFinId,
      // Legacy single-item fields
      item: legacyItem,
      qty: legacyQty,
      unit: legacyUnit,
      costEstimate: legacyCostEstimate,
    } = req.body;

    // Hardening & Global Auto-Routing:
    // If owner explicitly provided overrides, use them.
    // Otherwise, automatically inherit the company-wide global default authorizers from ProcurementConfig!
    const isOwnerUser = req.user.role === 'owner';
    let assignedReviewerId = isOwnerUser ? reqReviewerId : undefined;
    let assignedOpsApproverId = isOwnerUser ? reqOpsId : undefined;
    let assignedFinanceApproverId = isOwnerUser ? reqFinId : undefined;

    if (!assignedReviewerId || !assignedOpsApproverId || !assignedFinanceApproverId) {
      try {
        const globalConfig = await ProcurementConfig.findOne({ key: 'global' }).lean();
        if (globalConfig && globalConfig.autoAssignEnabled !== false) {
          if (!assignedReviewerId && globalConfig.defaultReviewerId) {
            assignedReviewerId = globalConfig.defaultReviewerId;
          }
          if (!assignedOpsApproverId && globalConfig.defaultOpsApproverId) {
            assignedOpsApproverId = globalConfig.defaultOpsApproverId;
          }
          if (!assignedFinanceApproverId && globalConfig.defaultFinanceApproverId) {
            assignedFinanceApproverId = globalConfig.defaultFinanceApproverId;
          }
        }
      } catch (cfgErr) {
        console.warn('ProcurementConfig auto-routing error:', cfgErr.message);
      }
    }

    let parsedItems = [];

    // 1. Process Multi-Item array if supplied
    if (Array.isArray(incomingItems) && incomingItems.length > 0) {
      parsedItems = incomingItems.map((itm) => {
        const q = Number(itm.qty) || 0;
        const rate = Number(itm.budgetUnitRate) || 0;
        return {
          isRabBased: Boolean(itm.isRabBased),
          rabItemId: itm.rabItemId || undefined,
          wbsCode: itm.wbsCode || '',
          item: String(itm.item || '').trim(),
          specifications: String(itm.specifications || '').trim(),
          qty: q,
          unit: itm.unit || 'Pcs',
          budgetUnitRate: rate,
          targetPriceRange: {
            min: Number(itm.targetPriceRange?.min) || rate * 0.9,
            max: Number(itm.targetPriceRange?.max) || rate * 1.1,
          },
          totalBudget: Number(itm.totalBudget) || q * rate,
        };
      }).filter((itm) => itm.item.length > 0 && itm.qty > 0);
    } else if (legacyItem && legacyItem.trim()) {
      // 2. Fallback to legacy single item
      const q = Number(legacyQty) || 1;
      const cost = Number(legacyCostEstimate) || 0;
      parsedItems = [{
        isRabBased: false,
        item: legacyItem.trim(),
        specifications: '',
        qty: q,
        unit: legacyUnit || 'Pcs',
        budgetUnitRate: cost / q,
        targetPriceRange: { min: (cost / q) * 0.9, max: (cost / q) * 1.1 },
        totalBudget: cost,
      }];
    }

    if (parsedItems.length === 0) {
      return res.status(400).json({ msg: 'At least one valid material line item is required' });
    }

    // Auto-generate Unique PR Number
    const prNumber = await generatePrNumber(projectId, req.user._id);

    // Calculate total budget across all line items
    const totalEstimatedBudget = parsedItems.reduce((acc, itm) => acc + itm.totalBudget, 0);

    const newRequest = new Request({
      prNumber,
      projectId: projectId || undefined,
      dateNeeded: dateNeeded || '',
      urgency: urgency || 'Normal',
      purpose: purpose || '',
      items: parsedItems,
      totalEstimatedBudget,
      status: 'PR_PENDING',
      requestedBy: req.user._id,
      assignedReviewerId: assignedReviewerId || undefined,
      assignedOpsApproverId: assignedOpsApproverId || undefined,
      assignedFinanceApproverId: assignedFinanceApproverId || undefined,
      // Sync legacy fields
      item: parsedItems.map((i) => i.item).join(', '),
      qty: parsedItems.reduce((acc, i) => acc + i.qty, 0),
      unit: parsedItems[0]?.unit || 'Pcs',
      costEstimate: totalEstimatedBudget,
    });

    await newRequest.save();

    // Populate for response
    const populated = await populateProcurement(Request.findById(newRequest._id));

    res.status(201).json(populated);

    // Notify assigned Reviewer if configured (In-app + Direct WhatsApp)
    if (populated.assignedReviewerId) {
      const reviewerUser = populated.assignedReviewerId;
      const waMemo = whatsappTemplates.formatAuthorizerAssigned(
        populated,
        'Peninjau Teknis & Kuantitas (Reviewer)',
        reviewerUser,
        req.user
      );
      notifyUserWithWA(
        reviewerUser._id,
        {
          type: 'general',
          title: `Penugasan Reviu PR (${prNumber})`,
          message: `Anda ditugaskan oleh ${req.user.fullName || 'Owner'} sebagai Peninjau Teknis untuk PR ${prNumber} (${populated.projectId?.nama || 'Proyek'}).`,
          data: { requestId: newRequest._id },
        },
        waMemo
      ).catch(console.warn);
    }

    // Notify assigned Ops Approver if configured (In-app + Direct WhatsApp)
    if (populated.assignedOpsApproverId) {
      const opsUser = populated.assignedOpsApproverId;
      const waMemo = whatsappTemplates.formatAuthorizerAssigned(
        populated,
        'Otorisasi Operasional PR (Ops Approver)',
        opsUser,
        req.user
      );
      notifyUserWithWA(
        opsUser._id,
        {
          type: 'general',
          title: `Penugasan Otorisasi Operasional (${prNumber})`,
          message: `Anda ditugaskan oleh ${req.user.fullName || 'Owner'} untuk Otorisasi Operasional PR ${prNumber} (${populated.projectId?.nama || 'Proyek'}).`,
          data: { requestId: newRequest._id },
        },
        waMemo
      ).catch(console.warn);
    }

    // Notify assigned Finance Approver if configured (In-app + Direct WhatsApp)
    if (populated.assignedFinanceApproverId) {
      const finUser = populated.assignedFinanceApproverId;
      const waMemo = whatsappTemplates.formatAuthorizerAssigned(
        populated,
        'Otorisasi Keuangan PO (Finance Approver)',
        finUser,
        req.user
      );
      notifyUserWithWA(
        finUser._id,
        {
          type: 'general',
          title: `Penugasan Otorisasi Keuangan (${prNumber})`,
          message: `Anda ditugaskan oleh ${req.user.fullName || 'Owner'} untuk Otorisasi Keuangan PO ${prNumber} (${populated.projectId?.nama || 'Proyek'}).`,
          data: { requestId: newRequest._id },
        },
        waMemo
      ).catch(console.warn);
    }

    // In-app & Push notifications to Supervisor/QC and Management
    notifyByRole(
      ['owner', 'director', 'operational_director', 'supervisor', 'asset_admin'],
      {
        type: 'general',
        title: `New Purchase Request (${prNumber})`,
        message: `${populated.requestedBy?.fullName || 'User'} submitted PR with ${parsedItems.length} item(s) for ${populated.projectId?.nama || 'General'}`,
        data: { requestId: newRequest._id },
      },
      req.user._id.toString()
    ).catch(console.error);

    // WhatsApp dispatch to Procurement & Site Team (fire-and-forget)
    try {
      const waMemo = whatsappTemplates.formatMaterialRequestCreated(populated);
      whatsappGateway.sendToDepartment('Procurement', waMemo, {
        groupId: process.env.WA_PROCUREMENT_GROUP_ID,
        priority: newRequest.urgency === 'High' || newRequest.urgency === 'Urgent' ? 'high' : 'normal',
        metadata: { requestId: newRequest._id.toString(), prNumber, event: 'pr_created' },
      }).catch(console.warn);
    } catch (waErr) {
      console.warn('[WA Dispatch Error]:', waErr.message);
    }
  } catch (error) {
    console.error('Create request error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/requests/:id/review - Tier 1: Technical Review / Reject by Supervisor / QC / QA (Passphrase Protected)
router.put('/:id/review', auth, authorize('owner', 'director', 'operational_director', 'site_manager', 'supervisor', 'admin_project'), async (req, res) => {
  try {
    const { notes, passphrase, action, rejectionReason } = req.body;

    // 1. Mandatory Passphrase Verification
    if (!passphrase || passphrase.length < 4) {
      return res.status(400).json({ msg: 'Passphrase diperlukan untuk otentikasi reviu/penolakan (min 4 karakter)' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ msg: 'User tidak ditemukan' });

    const isMatch = await bcrypt.compare(passphrase, user.password);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Passphrase / Kata sandi salah' });
    }

    const request = await Request.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ msg: 'Request not found' });
    }

    if (request.status !== 'PR_PENDING' && request.status !== 'Pending') {
      return res.status(400).json({ msg: `Cannot review/reject request in status: ${request.status}` });
    }

    // 2. Action: Reject PR by QC / SPV
    if (action === 'reject') {
      const reason = (rejectionReason || notes || '').trim();
      if (!reason) {
        return res.status(400).json({ msg: 'Alasan penolakan PR wajib diisi pada catatan' });
      }

      request.status = 'PR_REJECTED';
      request.rejectionReason = reason;
      request.reviewedBy = {
        user: req.user._id,
        role: req.user.role,
        reviewedAt: new Date(),
        notes: reason,
      };

      await request.save();
      const updated = await populateProcurement(Request.findById(request._id));

      res.json(updated);

      // Notify Requester that PR was rejected by QC/SPV (In-app + Direct WhatsApp)
      if (updated.requestedBy) {
        let waRejectMemo = '';
        try {
          waRejectMemo = whatsappTemplates.formatMaterialRequestStatus(updated, 'PR_REJECTED', reason);
        } catch (e) {
          console.warn('formatMaterialRequestStatus error:', e.message);
        }

        notifyUserWithWA(
          updated.requestedBy._id || updated.requestedBy,
          {
            type: 'request_rejected',
            title: `PR Ditolak oleh QC (${updated.prNumber})`,
            message: `Purchase Request ${updated.prNumber} ditolak oleh ${req.user.fullName} (${req.user.role}). Alasan: ${reason}`,
            data: { requestId: updated._id },
          },
          waRejectMemo
        ).catch(console.warn);
      }

      // Notify Management of the rejection
      notifyByRole(
        ['owner', 'director', 'operational_director', 'supervisor', 'admin_project'],
        {
          type: 'general',
          title: `PR Ditolak QC: ${updated.prNumber}`,
          message: `Ditolak oleh ${req.user.fullName}. Alasan: ${reason}`,
          data: { requestId: updated._id },
        },
        req.user._id.toString()
      ).catch(console.error);

      return;
    }

    // 3. Action: Approve / Verify PR
    request.reviewedBy = {
      user: req.user._id,
      role: req.user.role,
      reviewedAt: new Date(),
      notes: notes || '',
    };
    request.status = 'PR_REVIEWED';

    await request.save();
    const updated = await populateProcurement(Request.findById(request._id));

    res.json(updated);

    // Notify Operations Director
    notifyByRole(
      ['operational_director', 'director', 'owner'],
      {
        type: 'general',
        title: `PR Reviewed: ${request.prNumber || request.item}`,
        message: `Reviewed by ${req.user.fullName || 'Supervisor'}. Ready for Ops Director approval.`,
        data: { requestId: request._id },
      },
      req.user._id.toString()
    ).catch(console.error);

    // Generate WhatsApp reviewed memo
    let waMemo = '';
    try {
      waMemo = whatsappTemplates.formatPrReviewed(updated);
    } catch (e) {
      console.warn('formatPrReviewed error:', e.message);
    }

    // Notify assigned Ops Approver if configured (In-App + Direct WhatsApp)
    if (updated.assignedOpsApproverId) {
      notifyUserWithWA(
        updated.assignedOpsApproverId._id || updated.assignedOpsApproverId,
        {
          type: 'general',
          title: `Otorisasi PR Menunggu Anda (${updated.prNumber})`,
          message: `PR ${updated.prNumber} telah selesai diverifikasi QC oleh ${req.user.fullName} dan membutuhkan persetujuan Direktur Operasional Anda.`,
          data: { requestId: updated._id },
        },
        waMemo
      ).catch(console.warn);
    }

    // Notify requester that their PR has passed technical review
    if (updated.requestedBy) {
      notifyUserWithWA(
        updated.requestedBy._id || updated.requestedBy,
        {
          type: 'general',
          title: `PR Terverifikasi Teknis (${updated.prNumber})`,
          message: `PR ${updated.prNumber} telah diverifikasi oleh ${req.user.fullName} dan diteruskan ke Direktur Operasional.`,
          data: { requestId: updated._id },
        }
      ).catch(console.warn);
    }

    // Broadcast WhatsApp dispatch to Operations Department
    try {
      if (waMemo) {
        whatsappGateway.sendToDepartment('Operations', waMemo, {
          metadata: { requestId: updated._id.toString(), prNumber: updated.prNumber, event: 'pr_reviewed' },
        }).catch(console.warn);
      }
    } catch (waErr) {
      console.warn('[WA Dispatch Error]:', waErr.message);
    }
  } catch (error) {
    console.error('Review request error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/requests/:id/ops-approve - Tier 2: Approval by Operations Director
router.put('/:id/ops-approve', auth, authorize('owner', 'president_director', 'operational_director', 'director'), async (req, res) => {
  try {
    const { passphrase, notes } = req.body;

    if (!passphrase || passphrase.length < 4) {
      return res.status(400).json({ msg: 'Passphrase is required (min 4 characters)' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    const isMatch = await bcrypt.compare(passphrase, user.password);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Incorrect passphrase' });
    }

    const updated = await withTransaction(async (session) => {
      const reqDoc = await Request.findById(req.params.id).session(session);
      if (!reqDoc) {
        const err = new Error('Request not found');
        err.statusCode = 404;
        throw err;
      }

      reqDoc.opsApprovedBy = {
        user: req.user._id,
        approvedAt: new Date(),
        notes: notes || '',
      };
      reqDoc.status = 'PR_APPROVED';
      // Sync legacy approvedBy
      reqDoc.approvedBy = req.user._id;

      // Update committedQuantity in RABItems atomically for all RAB-linked items
      if (Array.isArray(reqDoc.items)) {
        for (const itm of reqDoc.items) {
          if (itm.isRabBased && itm.rabItemId) {
            await RABItem.findByIdAndUpdate(
              itm.rabItemId,
              { $inc: { committedQuantity: Number(itm.qty) || 0 } },
              { session }
            );
            if (ProjectTask) {
              await ProjectTask.findByIdAndUpdate(
                itm.rabItemId,
                { $inc: { committedQuantity: Number(itm.qty) || 0 } },
                { session }
              );
            }
          }
        }
      }

      await reqDoc.save({ session });
      return reqDoc;
    });

    const populated = await populateProcurement(Request.findById(updated._id));
    res.json(populated);

    // Notify requester that PR was approved by Ops Director
    if (populated.requestedBy) {
      notifyUserWithWA(
        populated.requestedBy._id || populated.requestedBy,
        {
          type: 'request_approved',
          title: `PR Disetujui: ${populated.prNumber}`,
          message: `PR ${populated.prNumber} telah disetujui oleh Direktur Operasional (${req.user.fullName}). Tim pengadaan sedang memulai sourcing vendor.`,
          data: { requestId: populated._id },
        }
      ).catch(console.warn);
    }

    // Notify Procurement team to begin vendor quotation & price comparison
    notifyByRole(
      ['asset_admin', 'admin_project', 'director', 'owner'],
      {
        type: 'request_approved',
        title: `PR Approved: ${populated.prNumber}`,
        message: `Approved by ${req.user.fullName}. Sourcing & Price comparison can proceed.`,
        data: { requestId: populated._id },
      },
      req.user._id.toString()
    ).catch(console.error);

    // WhatsApp dispatch to Procurement Team (fire-and-forget)
    try {
      const waMemo = whatsappTemplates.formatPrApproved(populated);
      whatsappGateway.sendToDepartment('Procurement', waMemo, {
        groupId: process.env.WA_PROCUREMENT_GROUP_ID,
        metadata: { requestId: populated._id.toString(), prNumber: populated.prNumber, event: 'pr_approved' },
      }).catch(console.warn);
    } catch (waErr) {
      console.warn('[WA Dispatch Error]:', waErr.message);
    }
  } catch (error) {
    console.error('Ops approve error:', error);
    res.status(500).json({ msg: error.message || 'Server error' });
  }
});

// PUT /api/requests/:id/assign-authorizers - Reassign or configure authorizers for a PR (Owner Only)
router.put('/:id/assign-authorizers', auth, authorize('owner'), async (req, res) => {
  try {
    const { assignedReviewerId, assignedOpsApproverId, assignedFinanceApproverId } = req.body;
    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ msg: 'Request not found' });

    const prevReviewer = request.assignedReviewerId?.toString();
    const prevOps = request.assignedOpsApproverId?.toString();
    const prevFinance = request.assignedFinanceApproverId?.toString();

    if (assignedReviewerId !== undefined) request.assignedReviewerId = assignedReviewerId || undefined;
    if (assignedOpsApproverId !== undefined) request.assignedOpsApproverId = assignedOpsApproverId || undefined;
    if (assignedFinanceApproverId !== undefined) request.assignedFinanceApproverId = assignedFinanceApproverId || undefined;

    await request.save();
    const populated = await populateProcurement(Request.findById(request._id));
    res.json(populated);

    const projectName = populated.projectId?.nama || 'Proyek Umum';

    // 1. Notify Reviewer if assigned or changed (In-App + Direct WhatsApp)
    if (
      populated.assignedReviewerId &&
      populated.assignedReviewerId._id.toString() !== prevReviewer
    ) {
      const reviewerUser = populated.assignedReviewerId;
      const waMsg = whatsappTemplates.formatAuthorizerAssigned(
        populated,
        'Peninjau Teknis & Kuantitas (Reviewer)',
        reviewerUser,
        req.user
      );
      notifyUserWithWA(
        reviewerUser._id,
        {
          type: 'general',
          title: `Penugasan Reviu PR (${populated.prNumber})`,
          message: `Anda ditugaskan oleh ${req.user.fullName || 'Owner'} sebagai Peninjau Teknis untuk PR ${populated.prNumber} (${projectName}).`,
          data: { requestId: populated._id },
        },
        waMsg
      ).catch(console.warn);
    }

    // 2. Notify Ops Approver if assigned or changed (In-App + Direct WhatsApp)
    if (
      populated.assignedOpsApproverId &&
      populated.assignedOpsApproverId._id.toString() !== prevOps
    ) {
      const opsUser = populated.assignedOpsApproverId;
      const waMsg = whatsappTemplates.formatAuthorizerAssigned(
        populated,
        'Otorisasi Operasional PR (Ops Approver)',
        opsUser,
        req.user
      );
      notifyUserWithWA(
        opsUser._id,
        {
          type: 'general',
          title: `Penugasan Otorisasi Operasional (${populated.prNumber})`,
          message: `Anda ditugaskan oleh ${req.user.fullName || 'Owner'} untuk Otorisasi Operasional PR ${populated.prNumber} (${projectName}).`,
          data: { requestId: populated._id },
        },
        waMsg
      ).catch(console.warn);
    }

    // 3. Notify Finance Approver if assigned or changed (In-App + Direct WhatsApp)
    if (
      populated.assignedFinanceApproverId &&
      populated.assignedFinanceApproverId._id.toString() !== prevFinance
    ) {
      const finUser = populated.assignedFinanceApproverId;
      const waMsg = whatsappTemplates.formatAuthorizerAssigned(
        populated,
        'Otorisasi Keuangan & Anggaran PO (Finance Approver)',
        finUser,
        req.user
      );
      notifyUserWithWA(
        finUser._id,
        {
          type: 'general',
          title: `Penugasan Otorisasi Keuangan PO (${populated.prNumber})`,
          message: `Anda ditugaskan oleh ${req.user.fullName || 'Owner'} untuk Otorisasi Keuangan PO ${populated.prNumber} (${projectName}).`,
          data: { requestId: populated._id },
        },
        waMsg
      ).catch(console.warn);
    }
  } catch (error) {
    console.error('Assign authorizers error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/requests/:id/compare-suppliers - Submit Multi-Supplier Quotation Matrix
router.put('/:id/compare-suppliers', auth, authorize('owner', 'director', 'operational_director', 'asset_admin', 'admin_project'), async (req, res) => {
  try {
    const { comparisons, assignedFinanceApproverId } = req.body;

    if (!Array.isArray(comparisons) || comparisons.length === 0) {
      return res.status(400).json({ msg: 'At least one candidate supplier comparison quote is required' });
    }

    const request = await Request.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ msg: 'Request not found' });
    }

    if (!['PR_APPROVED', 'PO_PENDING_FINANCE'].includes(request.status)) {
      return res.status(400).json({ msg: `Cannot submit price comparisons in status: ${request.status}` });
    }

    // Security Hardening: Only role 'owner' can assign or modify the Finance Approver
    if (req.user.role === 'owner' && assignedFinanceApproverId !== undefined) {
      request.assignedFinanceApproverId = assignedFinanceApproverId || undefined;
    } else if (!request.assignedFinanceApproverId) {
      try {
        const globalConfig = await ProcurementConfig.findOne({ key: 'global' }).lean();
        if (globalConfig?.defaultFinanceApproverId) {
          request.assignedFinanceApproverId = globalConfig.defaultFinanceApproverId;
        }
      } catch (err) {}
    }

    // Normalize and compute line item prices for each supplier comparison
    const normalizedComparisons = comparisons.map((comp) => {
      let subtotal = 0;
      let itemRates = [];

      if (Array.isArray(comp.itemRates) && comp.itemRates.length > 0) {
        itemRates = comp.itemRates.map((ir, idx) => {
          const prItem = request.items?.[idx] || request.items?.find((i) => i.item === ir.itemName);
          const q = prItem ? Number(prItem.qty) || 1 : 1;
          const quotedUnitPrice = Number(ir.quotedUnitPrice) || 0;
          const quotedTotalAmount = quotedUnitPrice * q;
          subtotal += quotedTotalAmount;
          return {
            itemIndex: idx,
            itemName: ir.itemName || prItem?.item || `Item ${idx + 1}`,
            quotedUnitPrice,
            quotedTotalAmount,
          };
        });
      } else {
        subtotal = Number(comp.subtotalItems) || 0;
      }

      const shippingCost = Number(comp.shippingCost) || 0;
      const totalLandedCost = subtotal + shippingCost;

      return {
        supplierName: String(comp.supplierName || '').trim(),
        location: String(comp.location || '').trim(),
        contact: String(comp.contact || '').trim(),
        itemRates,
        subtotalItems: subtotal,
        shippingCost,
        totalLandedCost,
        leadTimeDays: comp.leadTimeDays ? Number(comp.leadTimeDays) : undefined,
        paymentTerms: comp.paymentTerms || 'Tempo 14 Hari',
        notes: comp.notes || '',
        isRecommended: Boolean(comp.isRecommended),
        isPaylater: Boolean(comp.isPaylater || comp.schemeType === 'PAYLATER'),
        schemeType: comp.schemeType === 'PAYLATER' || comp.isPaylater ? 'PAYLATER' : 'STANDARD',
        interestRate: 0,
        settlementTerms: comp.settlementTerms || (comp.isPaylater ? 'Tempo Setelah GRN Tanpa Bunga' : ''),
      };
    });

    // Identify recommended supplier
    let recommended = normalizedComparisons.find((c) => c.isRecommended);
    if (!recommended) {
      recommended = normalizedComparisons[0];
      recommended.isRecommended = true;
    }

    request.comparisons = normalizedComparisons;
    request.selectedSupplier = {
      supplierName: recommended.supplierName,
      location: recommended.location || '',
      contact: recommended.contact || '',
      subtotalItems: recommended.subtotalItems,
      shippingCost: recommended.shippingCost,
      totalLandedCost: recommended.totalLandedCost,
      leadTimeDays: recommended.leadTimeDays,
      paymentTerms: recommended.paymentTerms,
      isPaylater: Boolean(recommended.isPaylater),
      schemeType: recommended.schemeType || 'STANDARD',
      interestRate: 0,
      settlementTerms: recommended.settlementTerms || '',
    };

    // Update item-level fixed PO prices from recommended supplier's itemRates
    if (Array.isArray(recommended.itemRates) && recommended.itemRates.length > 0) {
      request.items.forEach((item, idx) => {
        const rateObj = recommended.itemRates.find((r) => r.itemIndex === idx || r.itemName === item.item);
        if (rateObj && rateObj.quotedUnitPrice > 0) {
          item.poUnitPrice = Number(rateObj.quotedUnitPrice);
          item.poTotalAmount = item.qty * item.poUnitPrice;
        } else {
          item.poUnitPrice = item.budgetUnitRate;
          item.poTotalAmount = item.qty * item.poUnitPrice;
        }
      });
    }

    request.poSubtotal = request.selectedSupplier.subtotalItems || request.items.reduce((acc, i) => acc + (i.poTotalAmount || 0), 0);
    request.poShippingCost = request.selectedSupplier.shippingCost || 0;
    request.poTotalAmount = request.poSubtotal + request.poShippingCost;
    request.status = 'PO_PENDING_FINANCE';

    await request.save();
    const updated = await populateProcurement(Request.findById(request._id));

    res.json(updated);

    // Notify Finance Director & Budget Control
    notifyByRole(
      ['director', 'president_director', 'owner'],
      {
        type: 'general',
        title: `PO Sourcing Ready: ${request.prNumber}`,
        message: `Comparison with ${comparisons.length} supplier(s) submitted. Awaiting Finance approval.`,
        data: { requestId: request._id },
      },
      req.user._id.toString()
    ).catch(console.error);

    // Generate WhatsApp Sourcing memo
    let waMemo = '';
    try {
      waMemo = whatsappTemplates.formatPoSourcingSubmitted(updated);
    } catch (e) {
      console.warn('formatPoSourcingSubmitted error:', e.message);
    }

    // Notify specifically assigned Finance Approver if configured (In-app + Direct WhatsApp)
    if (updated.assignedFinanceApproverId) {
      notifyUserWithWA(
        updated.assignedFinanceApproverId._id || updated.assignedFinanceApproverId,
        {
          type: 'general',
          title: `Otorisasi PO Menunggu Anda (${updated.prNumber})`,
          message: `Komparasi supplier untuk PR ${updated.prNumber} (${updated.projectId?.nama || 'Proyek'}) diajukan untuk persetujuan PO dan penerbitan surat pesanan.`,
          data: { requestId: updated._id },
        },
        waMemo
      ).catch(console.warn);
    }

    // WhatsApp broadcast to Finance Department
    try {
      if (waMemo) {
        whatsappGateway.sendToDepartment('Finance', waMemo, {
          metadata: { requestId: updated._id.toString(), prNumber: updated.prNumber, event: 'sourcing_submitted' },
        }).catch(console.warn);
      }
    } catch (waErr) {
      console.warn('[WA Dispatch Error]:', waErr.message);
    }
  } catch (error) {
    console.error('Submit price comparison error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/requests/:id/finance-approve - Financial Sign-off & Tag MUST_PURCHASE
router.put('/:id/finance-approve', auth, authorize('owner', 'president_director', 'director'), async (req, res) => {
  try {
    const { passphrase, notes } = req.body;

    if (!passphrase || passphrase.length < 4) {
      return res.status(400).json({ msg: 'Passphrase is required (min 4 characters)' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    const isMatch = await bcrypt.compare(passphrase, user.password);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Incorrect passphrase' });
    }

    const request = await Request.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ msg: 'Request not found' });
    }

    if (request.status !== 'PO_PENDING_FINANCE') {
      return res.status(400).json({ msg: `Cannot approve PO in status: ${request.status}` });
    }

    // Generate official PO Number
    const poNumber = await generatePoNumber(request.projectId, request.selectedSupplier?.supplierName);

    request.poNumber = poNumber;
    request.financeApprovedBy = {
      user: req.user._id,
      approvedAt: new Date(),
      notes: notes || '',
    };
    request.status = 'MUST_PURCHASE';

    await request.save();
    const updated = await populateProcurement(Request.findById(request._id));

    res.json(updated);

    // Notify requester that PO has been approved and ready to purchase
    if (updated.requestedBy) {
      notifyUserWithWA(
        updated.requestedBy._id || updated.requestedBy,
        {
          type: 'general',
          title: `PO Resmi Disetujui (${poNumber})`,
          message: `Purchase Order ${poNumber} untuk ${updated.selectedSupplier?.supplierName} telah disetujui Direktur Keuangan. Pengadaan siap dieksekusi.`,
          data: { requestId: updated._id },
        }
      ).catch(console.warn);
    }

    // Notify Procurement team to execute purchase order
    notifyByRole(
      ['asset_admin', 'admin_project', 'director', 'owner'],
      {
        type: 'general',
        title: `PO Approved (${poNumber})`,
        message: `Finance Director approved PO for ${request.selectedSupplier?.supplierName}. Tagged as Must Purchase.`,
        data: { requestId: request._id },
      },
      req.user._id.toString()
    ).catch(console.error);

    // WhatsApp dispatch to Procurement & Operations
    try {
      const waMemo = whatsappTemplates.formatPoApproved(updated);
      whatsappGateway.sendToDepartment(['Procurement', 'Operations'], waMemo, {
        groupId: process.env.WA_PROCUREMENT_GROUP_ID,
        metadata: { requestId: updated._id.toString(), poNumber, event: 'po_approved' },
      }).catch(console.warn);
    } catch (waErr) {
      console.warn('[WA Dispatch Error]:', waErr.message);
    }
  } catch (error) {
    console.error('Finance approve error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/requests/:id/dispatch - In-Transit Dispatch (Upload Surat Jalan & Driver details)
router.put(
  '/:id/dispatch',
  auth,
  authorize('owner', 'director', 'operational_director', 'site_manager', 'supervisor', 'asset_admin', 'admin_project'),
  upload.fields([
    { name: 'suratJalanPhoto', maxCount: 1 },
    { name: 'supplierNotaPhoto', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { driverName, driverPhone, vehiclePlate, eta, notes } = req.body;
      const request = await Request.findById(req.params.id);

      if (!request) {
        return res.status(404).json({ msg: 'Request not found' });
      }

      let suratJalanUrl = req.body.suratJalanPhotoUrl || request.dispatchInfo?.suratJalanPhoto;
      if (req.files?.suratJalanPhoto?.[0]) {
        suratJalanUrl = `/uploads/documents/${req.files.suratJalanPhoto[0].filename}`;
      }

      let supplierNotaUrl = req.body.supplierNotaPhotoUrl || request.dispatchInfo?.supplierNotaPhoto;
      if (req.files?.supplierNotaPhoto?.[0]) {
        supplierNotaUrl = `/uploads/documents/${req.files.supplierNotaPhoto[0].filename}`;
      }

      request.dispatchInfo = {
        suratJalanPhoto: suratJalanUrl || '',
        supplierNotaPhoto: supplierNotaUrl || '',
        driverName: driverName || '',
        driverPhone: driverPhone || '',
        vehiclePlate: vehiclePlate || '',
        dispatchedAt: new Date(),
        eta: eta || '',
        notes: notes || '',
      };
      request.status = 'ON_THE_WAY';

      await request.save();
      const updated = await populateProcurement(Request.findById(request._id));

      res.json(updated);

      // Notify Site team with driver details
      notifyByRole(
        ['site_manager', 'supervisor', 'foreman', 'asset_admin'],
        {
          type: 'general',
          title: `Material On The Way (${request.poNumber || request.prNumber})`,
          message: `Dispatched by ${driverName || 'Driver'} (${vehiclePlate || 'Armada'}). Delivery en route to site.`,
          data: { requestId: request._id },
        },
        req.user._id.toString()
      ).catch(console.error);

      // WhatsApp dispatch to Site Team
      try {
        const waMemo = whatsappTemplates.formatPoDispatched(updated);
        whatsappGateway.sendToDepartment('Operations', waMemo, {
          metadata: { requestId: updated._id.toString(), poNumber: updated.poNumber, event: 'po_dispatched' },
        }).catch(console.warn);
      } catch (waErr) {
        console.warn('[WA Dispatch Error]:', waErr.message);
      }
    } catch (error) {
      console.error('Dispatch error:', error);
      res.status(500).json({ msg: 'Server error' });
    }
  }
);

// PUT /api/requests/:id/receive - Goods Receipt at Site with Mandatory Photo ➔ DONE
router.put(
  '/:id/receive',
  auth,
  authorize('owner', 'director', 'operational_director', 'site_manager', 'supervisor', 'foreman', 'asset_admin', 'admin_project'),
  upload.single('sitePhoto'),
  async (req, res) => {
    try {
      const { overallCondition, notes, receivedItems, receiverSignature, driverSignature } = req.body;
      const request = await Request.findById(req.params.id);

      if (!request) {
        return res.status(404).json({ msg: 'Request not found' });
      }

      let sitePhotoUrl = req.body.sitePhotoUrl || '';
      if (req.file) {
        sitePhotoUrl = `/uploads/photos/${req.file.filename}`;
      }

      if (!sitePhotoUrl && !request.deliveryProof?.sitePhoto) {
        return res.status(400).json({ msg: 'Job-site physical arrival photo is mandatory' });
      }

      // Parse received items array if provided
      let parsedItemReceiving = [];
      if (receivedItems) {
        try {
          parsedItemReceiving = typeof receivedItems === 'string' ? JSON.parse(receivedItems) : receivedItems;
        } catch {
          // ignore parsing error
        }
      }

      const updated = await withTransaction(async (session) => {
        const reqDoc = await Request.findById(req.params.id).session(session);

        // Update line items receivedQty & condition
        if (Array.isArray(reqDoc.items)) {
          reqDoc.items.forEach((itm, idx) => {
            const match = parsedItemReceiving.find((p) => p.itemIndex === idx || p.itemId === String(itm._id));
            if (match) {
              itm.receivedQty = Number(match.receivedQty) >= 0 ? Number(match.receivedQty) : itm.qty;
              itm.receivedCondition = match.receivedCondition || 'Good';
              itm.itemNotes = match.itemNotes || '';
            } else {
              // Default to full quantity received if not specified
              itm.receivedQty = itm.qty;
              itm.receivedCondition = 'Good';
            }
          });
        }

        reqDoc.deliveryProof = {
          sitePhoto: sitePhotoUrl || reqDoc.deliveryProof?.sitePhoto,
          overallCondition: overallCondition || 'Good',
          receivedBy: req.user._id,
          receivedAt: new Date(),
          notes: notes || '',
          receiverSignature: receiverSignature || reqDoc.deliveryProof?.receiverSignature || '',
          driverSignature: driverSignature || reqDoc.deliveryProof?.driverSignature || '',
        };
        reqDoc.status = 'DELIVERED';

        // ── Automated Stock Inflow into Supply Inventory ──
        if (reqDoc.projectId && Array.isArray(reqDoc.items)) {
          for (const itm of reqDoc.items) {
            const qtyToAdd = Number(itm.receivedQty) > 0 ? Number(itm.receivedQty) : Number(itm.qty);
            const itemCost = Number(itm.poUnitPrice) > 0 ? Number(itm.poUnitPrice) : Number(itm.budgetUnitRate);

            const existingSupply = await Supply.findOne({
              projectId: reqDoc.projectId,
              item: itm.item,
              status: 'Delivered',
            }).session(session);

            if (existingSupply) {
              await Supply.updateOne(
                { _id: existingSupply._id },
                {
                  $inc: { qty: qtyToAdd },
                  $set: { actualCost: itemCost, deliveryDate: new Date() },
                },
                { session }
              );
            } else {
              const newSupply = new Supply({
                projectId: reqDoc.projectId,
                item: itm.item,
                qty: qtyToAdd,
                unit: itm.unit || 'Pcs',
                cost: itm.budgetUnitRate || itemCost,
                actualCost: itemCost,
                status: 'Delivered',
                deliveryDate: new Date(),
              });
              await newSupply.save({ session });
            }

            // Realize RAB expenditure for RAB-linked items
            if (itm.isRabBased && itm.rabItemId) {
              await RABItem.findByIdAndUpdate(
                itm.rabItemId,
                {
                  $inc: {
                    realizedQuantity: qtyToAdd,
                    realizedAmount: qtyToAdd * itemCost,
                  },
                },
                { session }
              );
              if (ProjectTask) {
                await ProjectTask.findByIdAndUpdate(
                  itm.rabItemId,
                  {
                    $inc: {
                      realizedQuantity: qtyToAdd,
                      actualCost: qtyToAdd * itemCost,
                      realizedAmount: qtyToAdd * itemCost,
                    },
                  },
                  { session }
                );
              }
            }
          }
        }

        await reqDoc.save({ session });
        return reqDoc;
      });

      const populated = await populateProcurement(Request.findById(updated._id));
      res.json(populated);

      // Notify Project Manager and Director that procurement is done
      notifyByRole(
        ['owner', 'director', 'operational_director', 'site_manager'],
        {
          type: 'general',
          title: `Procurement Completed: ${populated.poNumber || populated.prNumber}`,
          message: `Materials physically arrived on site and verified by ${req.user.fullName}. Stock updated.`,
          data: { requestId: populated._id },
        },
        req.user._id.toString()
      ).catch(console.error);

      // WhatsApp dispatch to Management & Procurement
      try {
        const waMemo = whatsappTemplates.formatMaterialDelivered(populated);
        whatsappGateway.sendToDepartment(['Procurement', 'Finance', 'Operations'], waMemo, {
          metadata: { requestId: populated._id.toString(), poNumber: populated.poNumber, event: 'material_delivered' },
        }).catch(console.warn);
      } catch (waErr) {
        console.warn('[WA Dispatch Error]:', waErr.message);
      }
    } catch (error) {
      console.error('Receive goods error:', error);
      res.status(500).json({ msg: error.message || 'Server error' });
    }
  }
);

// PUT /api/requests/:id/confirm-payment - Post-GRN Payment Confirmation & Evidence Upload ➔ PAID
router.put(
  '/:id/confirm-payment',
  auth,
  authorize('owner', 'director', 'operational_director', 'admin_project', 'asset_admin'),
  upload.fields([
    { name: 'bonPembayaran', maxCount: 1 },
    { name: 'transferReceipt', maxCount: 1 },
    { name: 'invoiceDoc', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const request = await Request.findById(req.params.id);
      if (!request) {
        return res.status(404).json({ msg: 'Request not found' });
      }

      if (!['DELIVERED', 'Delivered'].includes(request.status)) {
        return res.status(400).json({ msg: 'Konfirmasi pembayaran hanya dapat dilakukan setelah barang diterima di lokasi (GRN)' });
      }

      const {
        paymentDate,
        paymentType,
        paymentMethod,
        amountPaid,
        sourceAccount,
        targetAccount,
        targetAccountName,
        referenceNumber,
        notes,
        payerSignature,
        schemeApplied,
      } = req.body;

      let bonPembayaranUrl = req.body.bonPembayaranUrl || request.paymentConfirmation?.bonPembayaranUrl || '';
      if (req.files?.bonPembayaran?.[0]) {
        bonPembayaranUrl = `/uploads/documents/${req.files.bonPembayaran[0].filename}`;
      }

      let transferReceiptUrl = req.body.transferReceiptUrl || request.paymentConfirmation?.transferReceiptUrl || '';
      if (req.files?.transferReceipt?.[0]) {
        transferReceiptUrl = `/uploads/documents/${req.files.transferReceipt[0].filename}`;
      }

      let invoiceDocUrl = req.body.invoiceDocUrl || request.paymentConfirmation?.invoiceDocUrl || '';
      if (req.files?.invoiceDoc?.[0]) {
        invoiceDocUrl = `/uploads/documents/${req.files.invoiceDoc[0].filename}`;
      }

      if (!bonPembayaranUrl && !request.paymentConfirmation?.bonPembayaranUrl) {
        return res.status(400).json({ msg: 'Foto bukti bon pembayaran / kuitansi fisik wajib diunggah' });
      }

      const parsedAmount = Number(amountPaid) > 0 ? Number(amountPaid) : (request.poTotalAmount || request.totalEstimatedBudget || 0);
      const isPaylater = request.selectedSupplier?.schemeType === 'PAYLATER' || request.selectedSupplier?.isPaylater || schemeApplied === 'PAYLATER';

      request.paymentConfirmation = {
        paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
        paymentType: paymentType || (isPaylater ? 'Pelunasan Paylater (Bunga 0%)' : 'Full Payment (Lunas)'),
        paymentMethod: paymentMethod || 'Bank Transfer',
        amountPaid: parsedAmount,
        principalAmount: parsedAmount,
        interestRate: 0,
        interestAmount: 0,
        sourceAccount: sourceAccount || '',
        targetAccount: targetAccount || '',
        targetAccountName: targetAccountName || '',
        referenceNumber: referenceNumber || '',
        notes: notes || '',
        bonPembayaranUrl,
        transferReceiptUrl,
        invoiceDocUrl,
        additionalEvidences: request.paymentConfirmation?.additionalEvidences || [],
        confirmedBy: req.user._id,
        confirmedAt: new Date(),
        payerSignature: payerSignature || request.paymentConfirmation?.payerSignature || '',
        schemeApplied: isPaylater ? 'PAYLATER' : 'STANDARD',
      };

      request.status = 'PAID';
      await request.save();

      const populated = await populateProcurement(Request.findById(request._id));
      res.json(populated);

      // In-app notification to management & project team
      notifyByRole(
        ['owner', 'director', 'operational_director', 'site_manager'],
        {
          type: 'general',
          title: `Procurement Payment Settled: ${populated.poNumber || populated.prNumber}`,
          message: `Pembayaran ${isPaylater ? '[Skema Paylater] ' : ''}dikonfirmasi oleh ${req.user.fullName} sebesar Rp ${parsedAmount.toLocaleString('id-ID')}. Status: LUNAS.`,
          data: { requestId: populated._id },
        },
        req.user._id.toString()
      ).catch(console.error);

      // WhatsApp notification
      try {
        const waMemo = whatsappTemplates.formatMaterialPaymentSettled(populated);
        whatsappGateway.sendToDepartment(['Finance', 'Procurement', 'Operations'], waMemo, {
          metadata: { requestId: populated._id.toString(), poNumber: populated.poNumber, event: 'material_payment_settled' },
        }).catch(console.warn);
      } catch (waErr) {
        console.warn('[WA Dispatch Error]:', waErr.message);
      }
    } catch (error) {
      console.error('Confirm payment error:', error);
      res.status(500).json({ msg: error.message || 'Server error' });
    }
  }
);

// PUT /api/requests/:id - Legacy approve / reject endpoint for backward compatibility
router.put('/:id', auth, authorize('owner', 'director', 'operational_director', 'asset_admin'), async (req, res) => {
  try {
    const { status, rejectionReason, passphrase } = req.body;

    if (status === 'Approved') {
      if (!passphrase || passphrase.length < 4) {
        return res.status(400).json({ msg: 'Passphrase is required (min 4 characters)' });
      }
      const user = await User.findById(req.user._id);
      if (!user) return res.status(404).json({ msg: 'User not found' });
      const isMatch = await bcrypt.compare(passphrase, user.password);
      if (!isMatch) return res.status(400).json({ msg: 'Incorrect passphrase' });
    }

    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ msg: 'Request not found' });

    if (status === 'Approved') {
      if (request.status === 'PO_PENDING_FINANCE') {
        const poNumber = await generatePoNumber(request.projectId, request.selectedSupplier?.supplierName);
        request.poNumber = poNumber;
        request.financeApprovedBy = {
          user: req.user._id,
          approvedAt: new Date(),
        };
        request.status = 'MUST_PURCHASE';
      } else {
        request.status = 'PR_APPROVED';
        request.approvedBy = req.user._id;
        request.opsApprovedBy = { user: req.user._id, approvedAt: new Date() };
      }
    } else if (status === 'Rejected') {
      request.status = 'PR_REJECTED';
      request.rejectionReason = rejectionReason || '';
    } else if (status) {
      request.status = status;
    }

    await request.save();
    const updated = await populateProcurement(Request.findById(request._id));

    res.json(updated);
  } catch (error) {
    console.error('Legacy update request error:', error);
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

    if (req.user.role !== 'owner' && request.requestedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ msg: 'Not authorized' });
    }

    // Only allow deletion if not yet approved
    if (['PR_APPROVED', 'MUST_PURCHASE', 'ON_THE_WAY', 'DELIVERED'].includes(request.status)) {
      return res.status(400).json({ msg: 'Cannot delete an approved or active procurement order' });
    }

    await request.deleteOne();
    res.json({ msg: 'Request deleted successfully' });
  } catch (error) {
    console.error('Delete request error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
