const express = require('express');
const { auth, authorize } = require('../middleware/auth');
const { ProcurementConfig, SPKLConfig, User } = require('../models');

const router = express.Router();

/**
 * GET /api/approval-config
 * Only accessible by role 'owner'.
 * Returns both Procurement & SPKL company-wide global approval configs and candidates.
 */
router.get('/', auth, authorize('owner'), async (req, res) => {
  try {
    let [procurementConfig, spklConfig, users] = await Promise.all([
      ProcurementConfig.findOne({ key: 'global' })
        .populate('defaultReviewerId', 'fullName role email phone position department')
        .populate('defaultOpsApproverId', 'fullName role email phone position department')
        .populate('defaultFinanceApproverId', 'fullName role email phone position department')
        .populate('updatedBy', 'fullName role')
        .lean(),
      SPKLConfig.findOne({ key: 'global' })
        .populate('defaultSupervisorId', 'fullName role email phone position department')
        .populate('defaultPmId', 'fullName role email phone position department')
        .populate('defaultFinanceId', 'fullName role email phone position department')
        .populate('updatedBy', 'fullName role')
        .lean(),
      User.find({ isActive: { $ne: false } })
        .select('_id fullName role position department email phone')
        .sort({ fullName: 1 })
        .lean(),
    ]);

    if (!procurementConfig) {
      procurementConfig = {
        key: 'global',
        defaultReviewerId: null,
        defaultOpsApproverId: null,
        defaultFinanceApproverId: null,
        autoAssignEnabled: true,
      };
    }

    if (!spklConfig) {
      spklConfig = {
        key: 'global',
        defaultSupervisorId: null,
        defaultPmId: null,
        defaultFinanceId: null,
        autoAssignEnabled: true,
      };
    }

    const candidateProcReviewers = users.filter((u) =>
      ['qc_inspector', 'supervisor', 'site_manager', 'admin_project', 'operational_director', 'director', 'president_director', 'owner'].includes(u.role)
    );
    const candidateProcOps = users.filter((u) =>
      ['operational_director', 'director', 'president_director', 'owner'].includes(u.role)
    );
    const candidateProcFinance = users.filter((u) =>
      ['finance', 'director', 'president_director', 'accounting', 'owner'].includes(u.role)
    );

    const candidateSpklSupervisors = users.filter((u) =>
      ['supervisor', 'site_manager', 'foreman', 'admin_project', 'operational_director', 'director', 'owner'].includes(u.role)
    );
    const candidateSpklPms = users.filter((u) =>
      ['site_manager', 'director', 'operational_director', 'president_director', 'owner'].includes(u.role)
    );
    const candidateSpklFinance = users.filter((u) =>
      ['finance', 'admin_project', 'director', 'accounting', 'owner'].includes(u.role)
    );

    res.json({
      procurement: procurementConfig,
      spkl: spklConfig,
      candidates: {
        procurement: {
          reviewers: candidateProcReviewers,
          opsApprovers: candidateProcOps,
          financeApprovers: candidateProcFinance,
        },
        spkl: {
          supervisors: candidateSpklSupervisors,
          projectManagers: candidateSpklPms,
          financeVerifiers: candidateSpklFinance,
        },
        allUsers: users,
      },
    });
  } catch (error) {
    console.error('Get approval config error:', error);
    res.status(500).json({ msg: 'Server error saat mengambil konfigurasi approval' });
  }
});

/**
 * PUT /api/approval-config/procurement
 * Only accessible by role 'owner'.
 * Updates company-wide Procurement default approval pipeline.
 */
router.put('/procurement', auth, authorize('owner'), async (req, res) => {
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
      .populate('defaultReviewerId', 'fullName role email phone position department')
      .populate('defaultOpsApproverId', 'fullName role email phone position department')
      .populate('defaultFinanceApproverId', 'fullName role email phone position department')
      .populate('updatedBy', 'fullName role')
      .lean();

    res.json(populated);
  } catch (error) {
    console.error('Update procurement approval config error:', error);
    res.status(500).json({ msg: 'Gagal menyimpan konfigurasi approval procurement' });
  }
});

/**
 * PUT /api/approval-config/spkl
 * Only accessible by role 'owner'.
 * Updates company-wide SPKL default verifier/approver pipeline.
 */
router.put('/spkl', auth, authorize('owner'), async (req, res) => {
  try {
    const { defaultSupervisorId, defaultPmId, defaultFinanceId, autoAssignEnabled } = req.body;

    let config = await SPKLConfig.findOne({ key: 'global' });
    if (!config) {
      config = new SPKLConfig({ key: 'global' });
    }

    if (defaultSupervisorId !== undefined) config.defaultSupervisorId = defaultSupervisorId || undefined;
    if (defaultPmId !== undefined) config.defaultPmId = defaultPmId || undefined;
    if (defaultFinanceId !== undefined) config.defaultFinanceId = defaultFinanceId || undefined;
    if (autoAssignEnabled !== undefined) config.autoAssignEnabled = Boolean(autoAssignEnabled);
    config.updatedBy = req.user._id;

    await config.save();

    const populated = await SPKLConfig.findById(config._id)
      .populate('defaultSupervisorId', 'fullName role email phone position department')
      .populate('defaultPmId', 'fullName role email phone position department')
      .populate('defaultFinanceId', 'fullName role email phone position department')
      .populate('updatedBy', 'fullName role')
      .lean();

    res.json(populated);
  } catch (error) {
    console.error('Update SPKL approval config error:', error);
    res.status(500).json({ msg: 'Gagal menyimpan konfigurasi approval SPKL' });
  }
});

module.exports = router;
