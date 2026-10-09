const express = require('express');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { SPKL, SPKLBatch, User, Project, Attendance, ProjectTask } = require('../models');
const { auth, authorize } = require('../middleware/auth');
const { withTransaction } = require('../utils/transaction');
const { notify, notifyByRole } = require('../utils/notify');
const whatsappGateway = require('../services/whatsappGateway');
const whatsappTemplates = require('../utils/whatsappTemplates');

const router = express.Router();

// ─── HELPER FUNCTIONS ────────────────────────────────────────────────────────

/**
 * Parses time string "HH:mm" to minutes from midnight
 */
function parseTimeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Calculates effective hours between startTime and endTime deducting breakMinutes.
 * Supports overnight shifts (e.g. 21:00 to 02:00 next day).
 */
function calculateEffectiveHours(startTime, endTime, breakMinutes = 0) {
  let startMin = parseTimeToMinutes(startTime);
  let endMin = parseTimeToMinutes(endTime);

  if (endMin < startMin) {
    // Overnight shift: add 24 hours (1440 minutes)
    endMin += 1440;
  }

  const durationMin = Math.max(0, endMin - startMin - Number(breakMinutes || 0));
  return Math.round((durationMin / 60) * 10) / 10;
}

/**
 * Calculates overtime pay based on hourly rate, hours, and rate scheme
 */
function calculateOvertimePay(hourlyRate, hours, rateScheme = 'standard_pp35', multiplier = 1.5) {
  const hr = Number(hourlyRate) || 0;
  const h = Number(hours) || 0;
  if (hr <= 0 || h <= 0) return 0;

  if (rateScheme === 'standard_pp35') {
    // Indonesian Labor Law (PP 35/2021) standard weekday formula:
    // First hour = 1.5x, subsequent hours = 2.0x
    if (h <= 1) {
      return Math.round(h * 1.5 * hr);
    }
    const firstHourPay = 1 * 1.5 * hr;
    const remainingHours = h - 1;
    return Math.round(firstHourPay + (remainingHours * 2.0 * hr));
  }

  if (rateScheme === 'flat_1.0') return Math.round(h * 1.0 * hr);
  if (rateScheme === 'flat_1.5') return Math.round(h * 1.5 * hr);
  if (rateScheme === 'flat_2.0') return Math.round(h * 2.0 * hr);

  return Math.round(h * (Number(multiplier) || 1.5) * hr);
}

/**
 * Generates next sequential SPKL document number for a given date:
 * Format: SPKL/MTE/YYYY/MM/XXXX
 */
async function generateNextSpklNumber(date, session = null) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const prefix = `SPKL/MTE/${year}/${month}/`;

  const query = SPKL.findOne({ spklNumber: new RegExp(`^${prefix}\\d{4}$`) })
    .sort({ spklNumber: -1 })
    .select('spklNumber');

  if (session) query.session(session);
  const lastRecord = await query.lean();

  let nextSeq = 1;
  if (lastRecord && lastRecord.spklNumber) {
    const lastNumStr = lastRecord.spklNumber.replace(prefix, '');
    const lastNum = parseInt(lastNumStr, 10);
    if (!isNaN(lastNum)) {
      nextSeq = lastNum + 1;
    }
  }

  return `${prefix}${String(nextSeq).padStart(4, '0')}`;
}

/**
 * Generates next sequential SPKL batch number:
 * Format: BATCH-SPKL-YYYYMMDD-XXX
 */
async function generateNextBatchNumber(date, session = null) {
  const d = new Date(date);
  const yyyymmdd = d.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `BATCH-SPKL-${yyyymmdd}-`;

  const query = SPKLBatch.findOne({ batchNumber: new RegExp(`^${prefix}\\d{3}$`) })
    .sort({ batchNumber: -1 })
    .select('batchNumber');

  if (session) query.session(session);
  const lastRecord = await query.lean();

  let nextSeq = 1;
  if (lastRecord && lastRecord.batchNumber) {
    const lastNumStr = lastRecord.batchNumber.replace(prefix, '');
    const lastNum = parseInt(lastNumStr, 10);
    if (!isNaN(lastNum)) {
      nextSeq = lastNum + 1;
    }
  }

  return `${prefix}${String(nextSeq).padStart(3, '0')}`;
}

/**
 * Synchronizes verified SPKL record into Attendance collection
 */
async function syncSpklToAttendance(spkl, session = null) {
  const targetDateStart = new Date(spkl.overtimeDate);
  targetDateStart.setHours(0, 0, 0, 0);
  const targetDateEnd = new Date(spkl.overtimeDate);
  targetDateEnd.setHours(23, 59, 59, 999);

  let query = Attendance.findOne({
    userId: spkl.workerId,
    date: { $gte: targetDateStart, $lte: targetDateEnd },
  });
  if (session) query = query.session(session);
  let att = await query;

  const effectivePay = spkl.compensation.manualOverridePay !== null && spkl.compensation.manualOverridePay !== undefined
    ? Number(spkl.compensation.manualOverridePay)
    : Number(spkl.compensation.totalPay || 0);

  const effectiveHours = Number(spkl.scheduleActual?.effectiveHours || 0);

  if (att) {
    att.overtimeHours = effectiveHours;
    att.overtimePay = effectivePay;
    att.overtimeProjectId = spkl.projectId;
    att.wageType = 'overtime';
    att.spklId = spkl._id;
    if (session) {
      await att.save({ session });
    } else {
      await att.save();
    }
  } else {
    att = new Attendance({
      userId: spkl.workerId,
      date: spkl.overtimeDate,
      status: 'Present',
      workType: 'Project',
      dailyRate: 0,
      hourlyRate: spkl.workerSnapshot?.hourlyRate || Math.round((spkl.workerSnapshot?.dailyRate || 150000) / 8),
      overtimeHours: effectiveHours,
      overtimePay: effectivePay,
      projectId: spkl.projectId,
      overtimeProjectId: spkl.projectId,
      wageType: 'overtime',
      paymentStatus: 'Unpaid',
      spklId: spkl._id,
      notes: `SPKL ${spkl.spklNumber} - ${spkl.location}`,
    });
    if (session) {
      await att.save({ session });
    } else {
      await att.save();
    }
  }

  spkl.attendanceId = att._id;
  if (session) {
    await spkl.save({ session });
  } else {
    await spkl.save();
  }
}

// ─── ROUTES ──────────────────────────────────────────────────────────────────

// GET /api/spkl/summary - Quick statistics for dashboard/tabs
router.get('/summary', auth, async (req, res) => {
  try {
    const [total, draft, pendingSupervisor, pendingPm, pendingFinance, verified] = await Promise.all([
      SPKL.countDocuments(),
      SPKL.countDocuments({ workflowStatus: 'draft' }),
      SPKL.countDocuments({ workflowStatus: 'submitted' }),
      SPKL.countDocuments({ workflowStatus: 'supervisor_verified' }),
      SPKL.countDocuments({ workflowStatus: 'pm_approved' }),
      SPKL.countDocuments({ workflowStatus: 'finance_verified' }),
    ]);

    res.json({
      total,
      draft,
      pendingSupervisor,
      pendingPm,
      pendingFinance,
      verified,
    });
  } catch (error) {
    console.error('Error fetching SPKL summary:', error);
    res.status(500).json({ msg: 'Gagal mengambil ringkasan data SPKL' });
  }
});

// GET /api/spkl - List SPKL records with search & filters
router.get('/', auth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      projectId,
      workerId,
      status,
      startDate,
      endDate,
      batchId,
      search,
    } = req.query;

    const query = {};

    if (projectId) query.projectId = projectId;
    if (workerId) query.workerId = workerId;
    if (batchId) query.batchId = batchId;
    if (status && status !== 'all') query.workflowStatus = status;

    if (startDate || endDate) {
      query.overtimeDate = {};
      if (startDate) query.overtimeDate.$gte = new Date(startDate);
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        query.overtimeDate.$lte = e;
      }
    }

    if (search) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { spklNumber: searchRegex },
        { 'workerSnapshot.fullName': searchRegex },
        { 'workerSnapshot.nik': searchRegex },
        { location: searchRegex },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [records, total] = await Promise.all([
      SPKL.find(query)
        .populate('workerId', 'fullName role position profileImage dailyRate nik department')
        .populate('projectId', 'nama lokasi')
        .populate('createdBy', 'fullName role')
        .populate('assignedSupervisorId', 'fullName role')
        .populate('assignedPmId', 'fullName role')
        .populate('assignedFinanceId', 'fullName role')
        .populate('signatures.supervisor.assignedTo', 'fullName role')
        .populate('signatures.projectManager.assignedTo', 'fullName role')
        .populate('signatures.financeDirector.assignedTo', 'fullName role')
        .sort({ overtimeDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      SPKL.countDocuments(query),
    ]);

    res.json({
      records,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
    });
  } catch (error) {
    console.error('Error fetching SPKL records:', error);
    res.status(500).json({ msg: 'Gagal memuat daftar SPKL' });
  }
});

// GET /api/spkl/project-wbs/:projectId - Fetch WBS task items for a project
router.get('/project-wbs/:projectId', auth, async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!projectId || !mongoose.isValidObjectId(projectId)) {
      return res.status(400).json({ msg: 'ID Proyek tidak valid' });
    }

    // 1. Fetch from ProjectTask (canonical unified WBS)
    const tasks = await ProjectTask.find({ projectId }).sort({ sortOrder: 1 }).lean();
    if (tasks && tasks.length > 0) {
      const formatted = tasks.map((t) => ({
        id: t._id,
        wbsCode: t.wbsCode || '',
        name: t.name,
        isSummary: t.isSummary || false,
        unit: t.unit || 'ls',
        quantity: t.quantity || 1,
        volume: t.quantity ? `${t.quantity} ${t.unit || ''}`.trim() : (t.unit || '1 ls'),
        progress: t.percentComplete || 0,
      }));
      return res.json({ success: true, tasks: formatted });
    }

    // 2. Fallback to Project.workItems (legacy work items)
    const project = await Project.findById(projectId).lean();
    if (project && Array.isArray(project.workItems) && project.workItems.length > 0) {
      const formatted = project.workItems.map((w, idx) => ({
        id: w._id || String(idx + 1),
        wbsCode: `${idx + 1}`,
        name: w.name,
        isSummary: false,
        unit: w.unit || w.volume || 'ls',
        quantity: w.qty || 1,
        volume: w.qty ? `${w.qty} ${w.unit || w.volume || ''}`.trim() : (w.unit || w.volume || '1 ls'),
        progress: w.progress || 0,
      }));
      return res.json({ success: true, tasks: formatted });
    }

    res.json({ success: true, tasks: [] });
  } catch (error) {
    console.error('Error fetching project WBS for SPKL:', error);
    res.status(500).json({ msg: 'Gagal memuat data WBS proyek', error: error.message });
  }
});

// GET /api/spkl/:id - Get single SPKL record
router.get('/:id', auth, async (req, res) => {
  try {
    const spkl = await SPKL.findById(req.params.id)
      .populate('workerId', 'fullName role position profileImage dailyRate nik department phone')
      .populate('projectId', 'nama lokasi kode')
      .populate('batchId', 'batchNumber workerCount status')
      .populate('createdBy', 'fullName role')
      .populate('assignedSupervisorId', 'fullName role email')
      .populate('assignedPmId', 'fullName role email')
      .populate('assignedFinanceId', 'fullName role email')
      .populate('signatures.worker.signedBy', 'fullName role')
      .populate('signatures.supervisor.signedBy', 'fullName role')
      .populate('signatures.supervisor.assignedTo', 'fullName role')
      .populate('signatures.projectManager.signedBy', 'fullName role')
      .populate('signatures.projectManager.assignedTo', 'fullName role')
      .populate('signatures.financeDirector.signedBy', 'fullName role')
      .populate('signatures.financeDirector.assignedTo', 'fullName role');

    if (!spkl) {
      return res.status(404).json({ msg: 'Dokumen SPKL tidak ditemukan' });
    }

    res.json(spkl);
  } catch (error) {
    console.error('Error fetching SPKL detail:', error);
    res.status(500).json({ msg: 'Gagal memuat detail SPKL' });
  }
});

// POST /api/spkl/individual - Create single SPKL document
router.post(
  '/individual',
  auth,
  authorize('owner', 'president_director', 'operational_director', 'director', 'supervisor', 'site_manager', 'admin_project', 'asset_admin'),
  async (req, res) => {
    try {
      const {
        workerId,
        projectId,
        location,
        overtimeDate,
        schedulePlan,
        scheduleActual,
        workItems = [],
        rateScheme = 'standard_pp35',
        multiplier = 1.5,
        manualOverridePay = null,
        draft = false,
        assignedSupervisorId = null,
        assignedPmId = null,
        assignedFinanceId = null,
      } = req.body;

      if (!workerId || !projectId || !overtimeDate) {
        return res.status(400).json({ msg: 'Pekerja, Proyek, dan Tanggal Lembur wajib diisi' });
      }

      const [worker, project] = await Promise.all([
        User.findById(workerId),
        Project.findById(projectId),
      ]);

      if (!worker) return res.status(404).json({ msg: 'Pekerja tidak ditemukan' });
      if (!project) return res.status(404).json({ msg: 'Proyek tidak ditemukan' });

      const resolvedLocation = location || project.lokasi || project.nama;

      // Calculate Schedule Hours
      const planStart = schedulePlan?.startTime || '17:00';
      const planEnd = schedulePlan?.endTime || '21:00';
      const planBreak = Number(schedulePlan?.breakMinutes || 0);
      const planEffHours = schedulePlan?.effectiveHours !== undefined
        ? Number(schedulePlan.effectiveHours)
        : calculateEffectiveHours(planStart, planEnd, planBreak);

      const actStart = scheduleActual?.startTime || planStart;
      const actEnd = scheduleActual?.endTime || planEnd;
      const actBreak = Number(scheduleActual?.breakMinutes ?? planBreak);
      const actEffHours = scheduleActual?.effectiveHours !== undefined
        ? Number(scheduleActual.effectiveHours)
        : calculateEffectiveHours(actStart, actEnd, actBreak);

      // Hourly rate calculation: dynamic baseline daily rate (defaults to worker rate or 150000) / 8
      const baselineDailyRate = Number(req.body.customDailyRate || req.body.dailyRate) > 0
        ? Number(req.body.customDailyRate || req.body.dailyRate)
        : (Number(worker.dailyRate) > 0 ? Number(worker.dailyRate) : 150000);
      const hourlyRate = Math.round(baselineDailyRate / 8);

      const calculatedPay = calculateOvertimePay(hourlyRate, actEffHours, rateScheme, multiplier);
      const finalPay = manualOverridePay !== null && manualOverridePay !== undefined && manualOverridePay !== ''
        ? Number(manualOverridePay)
        : calculatedPay;

      const spklNumber = await generateNextSpklNumber(overtimeDate);

      // Formatted work items
      const formattedWorkItems = (workItems || []).map((item, idx) => ({
        itemNo: item.itemNo || idx + 1,
        taskDescription: String(item.taskDescription || '').trim(),
        volumePlanned: String(item.volumePlanned || '').trim(),
        volumeActual: String(item.volumeActual || '').trim(),
        isFinished: Boolean(item.isFinished),
        progressPercent: Math.min(100, Math.max(0, Number(item.progressPercent || 0))),
      }));

      const newSpkl = new SPKL({
        spklNumber,
        workerId: worker._id,
        workerSnapshot: {
          fullName: worker.fullName,
          nik: worker.nik || '',
          department: worker.department || 'Operasional Lapangan',
          position: worker.position || worker.role || '',
          dailyRate: baselineDailyRate,
          hourlyRate,
        },
        projectId: project._id,
        location: resolvedLocation,
        overtimeDate: new Date(overtimeDate),
        schedulePlan: {
          startTime: planStart,
          endTime: planEnd,
          breakMinutes: planBreak,
          effectiveHours: planEffHours,
        },
        scheduleActual: {
          startTime: actStart,
          endTime: actEnd,
          breakMinutes: actBreak,
          effectiveHours: actEffHours,
        },
        compensation: {
          rateScheme,
          hourlyRate,
          effectiveHours: actEffHours,
          multiplier: Number(multiplier) || 1.5,
          totalPay: calculatedPay,
          manualOverridePay: manualOverridePay !== null && manualOverridePay !== undefined && manualOverridePay !== ''
            ? Number(manualOverridePay)
            : null,
        },
        workItems: formattedWorkItems,
        workflowStatus: draft ? 'draft' : 'submitted',
        assignedSupervisorId: assignedSupervisorId || null,
        assignedPmId: assignedPmId || null,
        assignedFinanceId: assignedFinanceId || null,
        signatures: {
          worker: {
            signed: true,
            signedAt: new Date(),
            signedBy: worker._id,
          },
          supervisor: {
            signed: false,
            assignedTo: assignedSupervisorId || null,
            note: '',
          },
          projectManager: {
            signed: false,
            assignedTo: assignedPmId || null,
            note: '',
          },
          financeDirector: {
            signed: false,
            assignedTo: assignedFinanceId || null,
            note: '',
          },
        },
        createdBy: (req.user._id || req.user.id),
      });

      await newSpkl.save();
      await newSpkl.populate('workerId', 'fullName role position');
      await newSpkl.populate('projectId', 'nama lokasi');

      // Dispatch Notifications to assigned Supervisor or supervisor role
      if (!draft) {
        if (assignedSupervisorId) {
          notify({
            recipient: assignedSupervisorId,
            type: 'spkl',
            title: 'Penugasan Verifikator SPKL (Supervisor)',
            message: `Dokumen ${spklNumber} untuk ${worker.fullName} (${project.nama}) diajukan dan memerlukan verifikasi Anda.`,
            data: { spklId: newSpkl._id, url: '/spkl' },
          });
        } else {
          notifyByRole(['supervisor', 'site_manager'], {
            type: 'spkl',
            title: 'Penugasan SPKL Baru Diajukan',
            message: `Dokumen ${spklNumber} untuk ${worker.fullName} (${project.nama}) diajukan dan menunggu verifikasi.`,
            data: { spklId: newSpkl._id, url: '/spkl' },
          }, (req.user._id || req.user.id));
        }

        // Notify assigned PM and Finance if assigned upfront
        if (assignedPmId && String(assignedPmId) !== String(assignedSupervisorId)) {
          notify({
            recipient: assignedPmId,
            type: 'spkl',
            title: 'Penugasan Approver SPKL (Project Manager)',
            message: `Anda ditugaskan sebagai Approver PM untuk SPKL ${spklNumber} (${worker.fullName}).`,
            data: { spklId: newSpkl._id, url: '/spkl' },
          });
        }
        if (assignedFinanceId && String(assignedFinanceId) !== String(assignedPmId) && String(assignedFinanceId) !== String(assignedSupervisorId)) {
          notify({
            recipient: assignedFinanceId,
            type: 'spkl',
            title: 'Penugasan Verifikator SPKL (Finance)',
            message: `Anda ditugaskan sebagai Verifikator Final Finance untuk SPKL ${spklNumber} (${worker.fullName}).`,
            data: { spklId: newSpkl._id, url: '/spkl' },
          });
        }
      }

      res.status(201).json({
        success: true,
        message: draft ? 'Draft SPKL berhasil disimpan' : 'SPKL berhasil dibuat dan diajukan',
        spkl: newSpkl,
      });
    } catch (error) {
      console.error('Error creating individual SPKL:', error);
      res.status(500).json({ msg: 'Gagal membuat SPKL individu', error: error.message });
    }
  }
);

// POST /api/spkl/bulk - Create batch SPKL documents for multiple crew workers
router.post(
  '/bulk',
  auth,
  authorize('owner', 'president_director', 'operational_director', 'director', 'supervisor', 'site_manager', 'admin_project', 'asset_admin'),
  async (req, res) => {
    try {
      const {
        projectId,
        location,
        department = 'Operasional Lapangan',
        overtimeDate,
        sharedSchedulePlan,
        sharedScheduleActual,
        sharedWorkItems = [],
        workers = [], // Array of { workerId, scheduleActualOverride?, workItemsOverride?, manualOverridePay? }
        rateScheme = 'standard_pp35',
        multiplier = 1.5,
        assignedSupervisorId = null,
        assignedPmId = null,
        assignedFinanceId = null,
      } = req.body;

      if (!projectId || !overtimeDate || !Array.isArray(workers) || workers.length === 0) {
        return res.status(400).json({ msg: 'Proyek, Tanggal Lembur, dan minimal 1 pekerja wajib diisi' });
      }

      const project = await Project.findById(projectId);
      if (!project) return res.status(404).json({ msg: 'Proyek tidak ditemukan' });

      const resolvedLocation = location || project.lokasi || project.nama;

      const result = await withTransaction(async (session) => {
        const batchNumber = await generateNextBatchNumber(overtimeDate, session);

        // Create Parent Batch Record
        const spklBatch = new SPKLBatch({
          batchNumber,
          projectId: project._id,
          department,
          location: resolvedLocation,
          overtimeDate: new Date(overtimeDate),
          workerCount: workers.length,
          spklIds: [],
          status: 'in_progress',
          assignedSupervisorId: assignedSupervisorId || null,
          assignedPmId: assignedPmId || null,
          assignedFinanceId: assignedFinanceId || null,
          sharedSchedule: {
            startTime: sharedScheduleActual?.startTime || '17:00',
            endTime: sharedScheduleActual?.endTime || '21:00',
            breakMinutes: Number(sharedScheduleActual?.breakMinutes || 0),
            effectiveHours: calculateEffectiveHours(
              sharedScheduleActual?.startTime || '17:00',
              sharedScheduleActual?.endTime || '21:00',
              Number(sharedScheduleActual?.breakMinutes || 0)
            ),
          },
          sharedWorkItems,
          createdBy: (req.user._id || req.user.id),
        });

        const createdSpklIds = [];
        const createdSpklRecords = [];

        // Fetch all workers at once
        const workerIds = workers.map(w => w.workerId);
        const userDocs = await User.find({ _id: { $in: workerIds } }).session(session);
        const userMap = new Map(userDocs.map(u => [u._id.toString(), u]));

        // Calculate Plan Times
        const planStart = sharedSchedulePlan?.startTime || '17:00';
        const planEnd = sharedSchedulePlan?.endTime || '21:00';
        const planBreak = Number(sharedSchedulePlan?.breakMinutes || 0);
        const planEffHours = calculateEffectiveHours(planStart, planEnd, planBreak);

        // Generate sequential SPKL numbers per worker
        for (let i = 0; i < workers.length; i++) {
          const wItem = workers[i];
          const userDoc = userMap.get(wItem.workerId.toString());
          if (!userDoc) continue;

          // Check if there is individual schedule override (e.g. left early)
          const actStart = wItem.scheduleActualOverride?.startTime || sharedScheduleActual?.startTime || planStart;
          const actEnd = wItem.scheduleActualOverride?.endTime || sharedScheduleActual?.endTime || planEnd;
          const actBreak = Number(wItem.scheduleActualOverride?.breakMinutes ?? sharedScheduleActual?.breakMinutes ?? planBreak);
          const actEffHours = calculateEffectiveHours(actStart, actEnd, actBreak);

          // Hourly rate calculation: dynamic worker baseline rate / 8
          const baselineDailyRate = Number(wItem.customDailyRate || wItem.dailyRate) > 0
            ? Number(wItem.customDailyRate || wItem.dailyRate)
            : (Number(userDoc.dailyRate) > 0 ? Number(userDoc.dailyRate) : 150000);
          const hourlyRate = Math.round(baselineDailyRate / 8);

          const calculatedPay = calculateOvertimePay(hourlyRate, actEffHours, rateScheme, multiplier);
          const finalPay = wItem.manualOverridePay !== null && wItem.manualOverridePay !== undefined && wItem.manualOverridePay !== ''
            ? Number(wItem.manualOverridePay)
            : calculatedPay;

          // Work items (either customized or inherited)
          const activeWorkItems = Array.isArray(wItem.workItemsOverride) && wItem.workItemsOverride.length > 0
            ? wItem.workItemsOverride
            : sharedWorkItems;

          const formattedWorkItems = activeWorkItems.map((item, idx) => ({
            itemNo: item.itemNo || idx + 1,
            taskDescription: String(item.taskDescription || '').trim(),
            volumePlanned: String(item.volumePlanned || '').trim(),
            volumeActual: String(item.volumeActual || '').trim(),
            isFinished: Boolean(item.isFinished),
            progressPercent: Math.min(100, Math.max(0, Number(item.progressPercent || 0))),
          }));

          const spklNumber = await generateNextSpklNumber(overtimeDate, session);

          const spklDoc = new SPKL({
            spklNumber,
            batchId: spklBatch._id,
            workerId: userDoc._id,
            workerSnapshot: {
              fullName: userDoc.fullName,
              nik: userDoc.nik || '',
              department: userDoc.department || department,
              position: userDoc.position || userDoc.role || '',
              dailyRate: baselineDailyRate,
              hourlyRate,
            },
            projectId: project._id,
            location: resolvedLocation,
            overtimeDate: new Date(overtimeDate),
            schedulePlan: {
              startTime: planStart,
              endTime: planEnd,
              breakMinutes: planBreak,
              effectiveHours: planEffHours,
            },
            scheduleActual: {
              startTime: actStart,
              endTime: actEnd,
              breakMinutes: actBreak,
              effectiveHours: actEffHours,
            },
            compensation: {
              rateScheme,
              hourlyRate,
              effectiveHours: actEffHours,
              multiplier: Number(multiplier) || 1.5,
              totalPay: calculatedPay,
              manualOverridePay: wItem.manualOverridePay !== null && wItem.manualOverridePay !== undefined && wItem.manualOverridePay !== ''
                ? Number(wItem.manualOverridePay)
                : null,
            },
            workItems: formattedWorkItems,
            workflowStatus: 'submitted',
            assignedSupervisorId: assignedSupervisorId || null,
            assignedPmId: assignedPmId || null,
            assignedFinanceId: assignedFinanceId || null,
            signatures: {
              worker: {
                signed: true,
                signedAt: new Date(),
                signedBy: userDoc._id,
              },
              supervisor: {
                signed: false,
                assignedTo: assignedSupervisorId || null,
                note: `Penugasan Massal: ${spklBatch.batchNumber}`,
              },
              projectManager: {
                signed: false,
                assignedTo: assignedPmId || null,
                note: '',
              },
              financeDirector: {
                signed: false,
                assignedTo: assignedFinanceId || null,
                note: '',
              },
            },
            createdBy: (req.user._id || req.user.id),
          });

          if (session) {
            await spklDoc.save({ session });
          } else {
            await spklDoc.save();
          }

          createdSpklIds.push(spklDoc._id);
          createdSpklRecords.push(spklDoc);
        }

        spklBatch.spklIds = createdSpklIds;
        if (session) {
          await spklBatch.save({ session });
        } else {
          await spklBatch.save();
        }

        return {
          batch: spklBatch,
          recordsCount: createdSpklRecords.length,
          batchNumber: spklBatch.batchNumber,
        };
      });

      // Dispatch Notifications to assigned Supervisor or supervisor role
      if (assignedSupervisorId) {
        notify({
          recipient: assignedSupervisorId,
          type: 'spkl',
          title: `Penugasan Lembur Massal (${result.recordsCount} Pekerja)`,
          message: `Batch ${result.batchNumber} (${project.nama}) diajukan dan memerlukan verifikasi Anda.`,
          data: { url: '/spkl' },
        });
      } else {
        notifyByRole(['supervisor', 'site_manager'], {
          type: 'spkl',
          title: `Penugasan Lembur Massal (${result.recordsCount} Pekerja)`,
          message: `Batch ${result.batchNumber} (${project.nama}) diajukan dan menunggu verifikasi.`,
          data: { url: '/spkl' },
        }, (req.user._id || req.user.id));
      }

      if (assignedPmId && String(assignedPmId) !== String(assignedSupervisorId)) {
        notify({
          recipient: assignedPmId,
          type: 'spkl',
          title: `Penugasan Approver Massal (Project Manager)`,
          message: `Anda ditugaskan sebagai Approver PM untuk Batch ${result.batchNumber} (${result.recordsCount} pekerja).`,
          data: { url: '/spkl' },
        });
      }
      if (assignedFinanceId && String(assignedFinanceId) !== String(assignedPmId) && String(assignedFinanceId) !== String(assignedSupervisorId)) {
        notify({
          recipient: assignedFinanceId,
          type: 'spkl',
          title: `Penugasan Verifikator Massal (Finance)`,
          message: `Anda ditugaskan sebagai Verifikator Final Finance untuk Batch ${result.batchNumber} (${result.recordsCount} pekerja).`,
          data: { url: '/spkl' },
        });
      }

      res.status(201).json({
        success: true,
        message: `Berhasil membuat penugasan lembur massal untuk ${result.recordsCount} pekerja`,
        ...result,
      });
    } catch (error) {
      console.error('Error in bulk SPKL creation:', error);
      res.status(500).json({ msg: 'Gagal membuat SPKL massal', error: error.message });
    }
  }
);

// POST /api/spkl/:id/verify-supervisor - Supervisor verifies the record with passphrase
router.post(
  '/:id/verify-supervisor',
  auth,
  async (req, res) => {
    try {
      const { note, passphrase } = req.body;
      if (!passphrase || passphrase.length < 4) {
        return res.status(400).json({ msg: 'Passphrase otorisasi wajib diisi (minimal 4 karakter)' });
      }

      const authUser = await User.findById(req.user._id || req.user.id);
      if (!authUser) return res.status(404).json({ msg: 'Pengguna otorisasi tidak ditemukan' });

      const isMatch = await bcrypt.compare(passphrase, authUser.password);
      if (!isMatch) {
        return res.status(400).json({ msg: 'Passphrase salah. Masukkan kata sandi login Anda yang valid.' });
      }

      const spkl = await SPKL.findById(req.params.id);
      if (!spkl) return res.status(404).json({ msg: 'SPKL tidak ditemukan' });

      // Verificator Assignment Check
      const currentUserId = (req.user._id || req.user.id).toString();
      const currentUserRole = (req.user.role || '').toLowerCase();
      const isExecutive = ['owner', 'president_director', 'operational_director', 'director'].includes(currentUserRole);

      const targetSupervisorId = (spkl.assignedSupervisorId || spkl.signatures?.supervisor?.assignedTo)?.toString();
      if (targetSupervisorId) {
        if (targetSupervisorId !== currentUserId && !isExecutive) {
          return res.status(403).json({
            msg: 'Akses ditolak. Dokumen SPKL ini ditugaskan kepada Supervisor lain untuk diverifikasi.'
          });
        }
      } else {
        const allowedRoles = ['supervisor', 'site_manager', 'foreman', 'admin_project', 'director', 'operational_director', 'president_director', 'owner'];
        if (!allowedRoles.includes(currentUserRole)) {
          return res.status(403).json({
            msg: 'Akses ditolak. Anda tidak memiliki wewenang sebagai Supervisor untuk memverifikasi dokumen ini.'
          });
        }
      }

      spkl.signatures.supervisor = {
        signed: true,
        signedAt: new Date(),
        signedBy: (req.user._id || req.user.id),
        assignedTo: targetSupervisorId || (req.user._id || req.user.id),
        note: note || 'Diverifikasi oleh Supervisor',
      };
      spkl.workflowStatus = 'supervisor_verified';
      spkl.updatedAt = new Date();
      await spkl.save();

      // Dispatch Notification to assigned PM Approver
      const targetPm = spkl.assignedPmId || spkl.signatures?.projectManager?.assignedTo;
      if (targetPm) {
        notify({
          recipient: targetPm,
          type: 'spkl',
          title: 'SPKL Memerlukan Persetujuan Project Manager',
          message: `Dokumen ${spkl.spklNumber} telah diverifikasi oleh Supervisor dan menunggu approval Anda.`,
          data: { spklId: spkl._id, url: '/spkl' },
        });
      } else {
        notifyByRole(['site_manager', 'project_manager', 'director', 'operational_director'], {
          type: 'spkl',
          title: 'SPKL Memerlukan Approval Project Manager',
          message: `Dokumen ${spkl.spklNumber} telah diverifikasi oleh Supervisor dan menunggu approval PM.`,
          data: { spklId: spkl._id, url: '/spkl' },
        }, (req.user._id || req.user.id));
      }

      res.json({ success: true, message: 'SPKL berhasil diverifikasi Supervisor', spkl });
    } catch (error) {
      console.error('Error verifying SPKL:', error);
      res.status(500).json({ msg: 'Gagal memproses verifikasi Supervisor' });
    }
  }
);

// POST /api/spkl/:id/approve-pm - Project Manager Approval with passphrase
router.post(
  '/:id/approve-pm',
  auth,
  async (req, res) => {
    try {
      const { note, passphrase } = req.body;
      if (!passphrase || passphrase.length < 4) {
        return res.status(400).json({ msg: 'Passphrase otorisasi wajib diisi (minimal 4 karakter)' });
      }

      const authUser = await User.findById(req.user._id || req.user.id);
      if (!authUser) return res.status(404).json({ msg: 'Pengguna otorisasi tidak ditemukan' });

      const isMatch = await bcrypt.compare(passphrase, authUser.password);
      if (!isMatch) {
        return res.status(400).json({ msg: 'Passphrase salah. Masukkan kata sandi login Anda yang valid.' });
      }

      const spkl = await SPKL.findById(req.params.id);
      if (!spkl) return res.status(404).json({ msg: 'SPKL tidak ditemukan' });

      // Verificator Assignment Check
      const currentUserId = (req.user._id || req.user.id).toString();
      const currentUserRole = (req.user.role || '').toLowerCase();
      const isExecutive = ['owner', 'president_director', 'operational_director', 'director'].includes(currentUserRole);

      const targetPmId = (spkl.assignedPmId || spkl.signatures?.projectManager?.assignedTo)?.toString();
      if (targetPmId) {
        if (targetPmId !== currentUserId && !isExecutive) {
          return res.status(403).json({
            msg: 'Akses ditolak. Dokumen SPKL ini ditugaskan kepada Project Manager lain untuk disetujui.'
          });
        }
      } else {
        const allowedRoles = ['site_manager', 'project_manager', 'director', 'operational_director', 'president_director', 'owner'];
        if (!allowedRoles.includes(currentUserRole)) {
          return res.status(403).json({
            msg: 'Akses ditolak. Anda tidak memiliki wewenang sebagai Project Manager untuk menyetujui dokumen ini.'
          });
        }
      }

      spkl.signatures.projectManager = {
        signed: true,
        signedAt: new Date(),
        signedBy: (req.user._id || req.user.id),
        assignedTo: targetPmId || (req.user._id || req.user.id),
        note: note || 'Disetujui oleh Project Manager',
      };
      spkl.workflowStatus = 'pm_approved';
      spkl.updatedAt = new Date();
      await spkl.save();

      // Dispatch Notification to assigned Finance or Finance team
      const targetFinance = spkl.assignedFinanceId || spkl.signatures?.financeDirector?.assignedTo;
      if (targetFinance) {
        notify({
          recipient: targetFinance,
          type: 'spkl',
          title: 'SPKL Memerlukan Verifikasi Final Finance',
          message: `Dokumen ${spkl.spklNumber} telah disetujui PM dan menunggu verifikasi final Anda.`,
          data: { spklId: spkl._id, url: '/spkl' },
        });
      } else {
        notifyByRole(['finance', 'admin_project', 'director', 'operational_director', 'president_director', 'owner'], {
          type: 'spkl',
          title: 'SPKL Siap Verifikasi Final Finance',
          message: `Dokumen ${spkl.spklNumber} telah disetujui PM dan siap diverifikasi final ke payroll.`,
          data: { spklId: spkl._id, url: '/spkl' },
        }, (req.user._id || req.user.id));
      }

      // WhatsApp Alert to Finance & HR Desk (fire-and-forget)
      const waSpklMemo = whatsappTemplates.formatSpklFinalApproved(spkl);
      whatsappGateway
        .sendToDepartment('Finance', waSpklMemo, {
          groupId: process.env.WA_FINANCE_GROUP_ID,
          metadata: { spklId: spkl._id.toString(), event: 'pm_approved' },
        })
        .catch((waErr) => console.warn('[WA SPKL Finance Alert Warning]:', waErr.message));

      res.json({ success: true, message: 'SPKL berhasil disetujui Project Manager', spkl });
    } catch (error) {
      console.error('Error approving SPKL by PM:', error);
      res.status(500).json({ msg: 'Gagal memproses persetujuan PM' });
    }
  }
);

// POST /api/spkl/:id/verify-finance - Finance Director Final Verification & Sync with passphrase
router.post(
  '/:id/verify-finance',
  auth,
  async (req, res) => {
    try {
      const { note, passphrase } = req.body;
      if (!passphrase || passphrase.length < 4) {
        return res.status(400).json({ msg: 'Passphrase otorisasi wajib diisi (minimal 4 karakter)' });
      }

      const authUser = await User.findById(req.user._id || req.user.id);
      if (!authUser) return res.status(404).json({ msg: 'Pengguna otorisasi tidak ditemukan' });

      const isMatch = await bcrypt.compare(passphrase, authUser.password);
      if (!isMatch) {
        return res.status(400).json({ msg: 'Passphrase salah. Masukkan kata sandi login Anda yang valid.' });
      }

      const spkl = await SPKL.findById(req.params.id);
      if (!spkl) return res.status(404).json({ msg: 'SPKL tidak ditemukan' });

      // Verificator Assignment Check
      const currentUserId = (req.user._id || req.user.id).toString();
      const currentUserRole = (req.user.role || '').toLowerCase();
      const isExecutive = ['owner', 'president_director', 'operational_director', 'director'].includes(currentUserRole);

      const targetFinanceId = (spkl.assignedFinanceId || spkl.signatures?.financeDirector?.assignedTo)?.toString();
      if (targetFinanceId) {
        if (targetFinanceId !== currentUserId && !isExecutive) {
          return res.status(403).json({
            msg: 'Akses ditolak. Dokumen SPKL ini ditugaskan kepada Petugas Finance lain untuk diverifikasi.'
          });
        }
      } else {
        const allowedRoles = ['finance', 'admin_project', 'accounting', 'director', 'operational_director', 'president_director', 'owner'];
        if (!allowedRoles.includes(currentUserRole)) {
          return res.status(403).json({
            msg: 'Akses ditolak. Anda tidak memiliki wewenang Finance untuk memverifikasi dokumen ini.'
          });
        }
      }

      await withTransaction(async (session) => {
        spkl.signatures.financeDirector = {
          signed: true,
          signedAt: new Date(),
          signedBy: (req.user._id || req.user.id),
          assignedTo: targetFinanceId || (req.user._id || req.user.id),
          note: note || 'Verifikasi Final oleh Finance Director',
        };
        spkl.workflowStatus = 'finance_verified';
        spkl.updatedAt = new Date();

        if (session) {
          await spkl.save({ session });
        } else {
          await spkl.save();
        }

        // Automatic synchronization to Attendance & Payroll
        await syncSpklToAttendance(spkl, session);
      });

      // Dispatch Notification to Creator/Worker
      if (spkl.createdBy) {
        notify({
          recipient: spkl.createdBy,
          type: 'spkl',
          title: 'SPKL Terverifikasi Final & Tersinkronkan',
          message: `Dokumen ${spkl.spklNumber} telah diverifikasi final oleh Finance dan otomatis tersinkron ke presensi & slip gaji.`,
          data: { spklId: spkl._id, url: '/spkl' },
        });
      }

      res.json({
        success: true,
        message: 'SPKL diverifikasi final oleh Finance dan otomatis tersinkronisasi ke Presensi/Slip Gaji',
        spkl,
      });
    } catch (error) {
      console.error('Error in final finance verification:', error);
      res.status(500).json({ msg: 'Gagal memproses verifikasi final Finance' });
    }
  }
);

// POST /api/spkl/batch-verify - Batch verification for Supervisor, PM, or Finance with passphrase
router.post(
  '/batch-verify',
  auth,
  async (req, res) => {
    try {
      const { spklIds = [], step = 'pm', note, passphrase } = req.body;
      if (!passphrase || passphrase.length < 4) {
        return res.status(400).json({ msg: 'Passphrase otorisasi wajib diisi (minimal 4 karakter)' });
      }

      const authUser = await User.findById(req.user._id || req.user.id);
      if (!authUser) return res.status(404).json({ msg: 'Pengguna otorisasi tidak ditemukan' });

      const isMatch = await bcrypt.compare(passphrase, authUser.password);
      if (!isMatch) {
        return res.status(400).json({ msg: 'Passphrase salah. Masukkan kata sandi login Anda yang valid.' });
      }

      if (!Array.isArray(spklIds) || spklIds.length === 0) {
        return res.status(400).json({ msg: 'Daftar ID SPKL wajib disertakan' });
      }

      const currentUserId = (req.user._id || req.user.id).toString();
      const currentUserRole = (req.user.role || '').toLowerCase();
      const isExecutive = ['owner', 'president_director', 'operational_director', 'director'].includes(currentUserRole);

      const records = await SPKL.find({ _id: { $in: spklIds } });
      let updatedCount = 0;

      for (const spkl of records) {
        if (step === 'supervisor') {
          const targetSupervisorId = (spkl.assignedSupervisorId || spkl.signatures?.supervisor?.assignedTo)?.toString();
          if (targetSupervisorId) {
            if (targetSupervisorId !== currentUserId && !isExecutive) continue;
          } else if (!isExecutive && !['supervisor', 'site_manager', 'foreman', 'admin_project'].includes(currentUserRole)) {
            continue;
          }

          spkl.signatures.supervisor = {
            signed: true,
            signedAt: new Date(),
            signedBy: (req.user._id || req.user.id),
            assignedTo: targetSupervisorId || (req.user._id || req.user.id),
            note: note || 'Verifikasi Massal Supervisor',
          };
          spkl.workflowStatus = 'supervisor_verified';
          await spkl.save();
          updatedCount++;
        } else if (step === 'pm') {
          const targetPmId = (spkl.assignedPmId || spkl.signatures?.projectManager?.assignedTo)?.toString();
          if (targetPmId) {
            if (targetPmId !== currentUserId && !isExecutive) continue;
          } else if (!isExecutive && !['site_manager', 'project_manager'].includes(currentUserRole)) {
            continue;
          }

          spkl.signatures.projectManager = {
            signed: true,
            signedAt: new Date(),
            signedBy: (req.user._id || req.user.id),
            assignedTo: targetPmId || (req.user._id || req.user.id),
            note: note || 'Approval Massal Project Manager',
          };
          spkl.workflowStatus = 'pm_approved';
          await spkl.save();
          updatedCount++;
        } else if (step === 'finance') {
          const targetFinanceId = (spkl.assignedFinanceId || spkl.signatures?.financeDirector?.assignedTo)?.toString();
          if (targetFinanceId) {
            if (targetFinanceId !== currentUserId && !isExecutive) continue;
          } else if (!isExecutive && !['finance', 'admin_project', 'accounting'].includes(currentUserRole)) {
            continue;
          }

          spkl.signatures.financeDirector = {
            signed: true,
            signedAt: new Date(),
            signedBy: (req.user._id || req.user.id),
            assignedTo: targetFinanceId || (req.user._id || req.user.id),
            note: note || 'Verifikasi Final Massal Finance',
          };
          spkl.workflowStatus = 'finance_verified';
          await spkl.save();
          await syncSpklToAttendance(spkl);
          updatedCount++;
        }
      }

      if (updatedCount > 0) {
        if (step === 'pm') {
          notifyByRole(['site_manager', 'project_manager', 'director', 'operational_director'], {
            type: 'spkl',
            title: 'SPKL Massal Menunggu Approval PM',
            message: `${updatedCount} dokumen SPKL telah diverifikasi Supervisor dan menunggu persetujuan PM.`,
            data: { url: '/spkl' },
          }, (req.user._id || req.user.id));
        } else if (step === 'finance') {
          notifyByRole(['finance', 'admin_project', 'director', 'operational_director', 'owner'], {
            type: 'spkl',
            title: 'SPKL Massal Menunggu Verifikasi Final Finance',
            message: `${updatedCount} dokumen SPKL telah disetujui PM dan siap diverifikasi final ke payroll.`,
            data: { url: '/spkl' },
          }, (req.user._id || req.user.id));
        }
      }

      res.json({
        success: true,
        message: `Berhasil memverifikasi ${updatedCount} dokumen SPKL`,
        updatedCount,
      });
    } catch (error) {
      console.error('Error in batch verification:', error);
      res.status(500).json({ msg: 'Gagal memproses verifikasi massal' });
    }
  }
);

// POST /api/spkl/:id/reject - Rejection handler
router.post(
  '/:id/reject',
  auth,
  async (req, res) => {
    try {
      const { reason } = req.body;
      if (!reason) {
        return res.status(400).json({ msg: 'Alasan penolakan wajib diisi' });
      }

      const spkl = await SPKL.findById(req.params.id);
      if (!spkl) return res.status(404).json({ msg: 'SPKL tidak ditemukan' });

      // Verificator Assignment Check for Rejection
      const currentUserId = (req.user._id || req.user.id).toString();
      const currentUserRole = (req.user.role || '').toLowerCase();
      const isExecutive = ['owner', 'president_director', 'operational_director', 'director'].includes(currentUserRole);

      let isAllowed = isExecutive;
      if (spkl.workflowStatus === 'submitted') {
        const targetSupervisorId = (spkl.assignedSupervisorId || spkl.signatures?.supervisor?.assignedTo)?.toString();
        if (targetSupervisorId) {
          if (targetSupervisorId === currentUserId) isAllowed = true;
        } else if (['supervisor', 'site_manager', 'foreman', 'admin_project'].includes(currentUserRole)) {
          isAllowed = true;
        }
      } else if (spkl.workflowStatus === 'supervisor_verified') {
        const targetPmId = (spkl.assignedPmId || spkl.signatures?.projectManager?.assignedTo)?.toString();
        if (targetPmId) {
          if (targetPmId === currentUserId) isAllowed = true;
        } else if (['site_manager', 'project_manager'].includes(currentUserRole)) {
          isAllowed = true;
        }
      } else if (spkl.workflowStatus === 'pm_approved') {
        const targetFinanceId = (spkl.assignedFinanceId || spkl.signatures?.financeDirector?.assignedTo)?.toString();
        if (targetFinanceId) {
          if (targetFinanceId === currentUserId) isAllowed = true;
        } else if (['finance', 'admin_project', 'accounting'].includes(currentUserRole)) {
          isAllowed = true;
        }
      }

      if (!isAllowed) {
        return res.status(403).json({
          msg: 'Akses ditolak. Anda bukan verifikator yang ditugaskan untuk menolak dokumen SPKL ini.'
        });
      }

      spkl.workflowStatus = 'rejected';
      spkl.rejectionReason = reason;
      spkl.updatedAt = new Date();
      await spkl.save();

      // Dispatch Notification to Submitter
      if (spkl.createdBy) {
        notify({
          recipient: spkl.createdBy,
          type: 'spkl',
          title: 'SPKL Dikembalikan / Perlu Revisi',
          message: `Dokumen ${spkl.spklNumber} dikembalikan untuk revisi. Catatan: ${reason}`,
          data: { spklId: spkl._id, url: '/spkl' },
        });
      }

      res.json({ success: true, message: 'SPKL telah ditolak', spkl });
    } catch (error) {
      console.error('Error rejecting SPKL:', error);
      res.status(500).json({ msg: 'Gagal menolak SPKL' });
    }
  }
);

// POST /api/spkl/:id/allocate-verifiers - Owner re-allocates verifiers (Supervisor, PM, Finance)
router.post(
  '/:id/allocate-verifiers',
  auth,
  authorize('owner', 'president_director', 'operational_director', 'director'),
  async (req, res) => {
    try {
      const { assignedSupervisorId, assignedPmId, assignedFinanceId } = req.body;
      const spkl = await SPKL.findById(req.params.id);
      if (!spkl) return res.status(404).json({ msg: 'Dokumen SPKL tidak ditemukan' });

      if (assignedSupervisorId !== undefined) {
        spkl.assignedSupervisorId = assignedSupervisorId || null;
        if (!spkl.signatures.supervisor.signed) {
          spkl.signatures.supervisor.assignedTo = assignedSupervisorId || null;
        }
      }
      if (assignedPmId !== undefined) {
        spkl.assignedPmId = assignedPmId || null;
        if (!spkl.signatures.projectManager.signed) {
          spkl.signatures.projectManager.assignedTo = assignedPmId || null;
        }
      }
      if (assignedFinanceId !== undefined) {
        spkl.assignedFinanceId = assignedFinanceId || null;
        if (!spkl.signatures.financeDirector.signed) {
          spkl.signatures.financeDirector.assignedTo = assignedFinanceId || null;
        }
      }

      spkl.updatedAt = new Date();
      await spkl.save();

      await spkl.populate('assignedSupervisorId', 'fullName role email');
      await spkl.populate('assignedPmId', 'fullName role email');
      await spkl.populate('assignedFinanceId', 'fullName role email');
      await spkl.populate('signatures.supervisor.assignedTo', 'fullName role');
      await spkl.populate('signatures.projectManager.assignedTo', 'fullName role');
      await spkl.populate('signatures.financeDirector.assignedTo', 'fullName role');

      // Dispatch Notifications to newly assigned verificators
      const notifList = [];
      if (assignedSupervisorId) {
        notifList.push({
          recipient: assignedSupervisorId,
          type: 'spkl',
          title: 'Penugasan Verifikator SPKL (Supervisor Lapangan)',
          message: `Owner menetapkan Anda sebagai Verifikator Supervisor Lapangan untuk dokumen SPKL ${spkl.spklNumber} (${spkl.workerSnapshot?.fullName || 'Pekerja'}).`,
          data: { spklId: spkl._id, url: '/spkl' },
        });
      }
      if (assignedPmId) {
        notifList.push({
          recipient: assignedPmId,
          type: 'spkl',
          title: 'Penugasan Approver SPKL (Project Manager)',
          message: `Owner menetapkan Anda sebagai Approver Project Manager untuk dokumen SPKL ${spkl.spklNumber} (${spkl.workerSnapshot?.fullName || 'Pekerja'}).`,
          data: { spklId: spkl._id, url: '/spkl' },
        });
      }
      if (assignedFinanceId) {
        notifList.push({
          recipient: assignedFinanceId,
          type: 'spkl',
          title: 'Penugasan Verifikator SPKL (Finance / Payroll)',
          message: `Owner menetapkan Anda sebagai Verifikator Final Finance untuk dokumen SPKL ${spkl.spklNumber} (${spkl.workerSnapshot?.fullName || 'Pekerja'}).`,
          data: { spklId: spkl._id, url: '/spkl' },
        });
      }
      if (notifList.length > 0) {
        notify(notifList);
      }

      res.json({
        success: true,
        message: 'Alokasi verifikator berhasil diperbarui oleh Owner',
        spkl,
      });
    } catch (error) {
      console.error('Error allocating verifiers:', error);
      res.status(500).json({ msg: 'Gagal memperbarui alokasi verifikator' });
    }
  }
);

// POST /api/spkl/batch-allocate-verifiers - Owner batch re-allocates verifiers
router.post(
  '/batch-allocate-verifiers',
  auth,
  authorize('owner', 'president_director', 'operational_director', 'director'),
  async (req, res) => {
    try {
      const { spklIds = [], assignedSupervisorId, assignedPmId, assignedFinanceId } = req.body;
      if (!Array.isArray(spklIds) || spklIds.length === 0) {
        return res.status(400).json({ msg: 'Daftar ID SPKL wajib disertakan' });
      }

      const updateOps = { updatedAt: new Date() };
      if (assignedSupervisorId !== undefined) {
        updateOps.assignedSupervisorId = assignedSupervisorId || null;
        updateOps['signatures.supervisor.assignedTo'] = assignedSupervisorId || null;
      }
      if (assignedPmId !== undefined) {
        updateOps.assignedPmId = assignedPmId || null;
        updateOps['signatures.projectManager.assignedTo'] = assignedPmId || null;
      }
      if (assignedFinanceId !== undefined) {
        updateOps.assignedFinanceId = assignedFinanceId || null;
        updateOps['signatures.financeDirector.assignedTo'] = assignedFinanceId || null;
      }

      await SPKL.updateMany({ _id: { $in: spklIds } }, { $set: updateOps });

      // Dispatch Notifications to batch assigned verificators
      const batchNotifs = [];
      if (assignedSupervisorId) {
        batchNotifs.push({
          recipient: assignedSupervisorId,
          type: 'spkl',
          title: 'Penugasan Verifikator Massal (Supervisor)',
          message: `Owner menetapkan Anda sebagai Verifikator Supervisor untuk ${spklIds.length} dokumen SPKL terpilih.`,
          data: { url: '/spkl' },
        });
      }
      if (assignedPmId) {
        batchNotifs.push({
          recipient: assignedPmId,
          type: 'spkl',
          title: 'Penugasan Approver Massal (Project Manager)',
          message: `Owner menetapkan Anda sebagai Approver PM untuk ${spklIds.length} dokumen SPKL terpilih.`,
          data: { url: '/spkl' },
        });
      }
      if (assignedFinanceId) {
        batchNotifs.push({
          recipient: assignedFinanceId,
          type: 'spkl',
          title: 'Penugasan Verifikator Massal (Finance / Payroll)',
          message: `Owner menetapkan Anda sebagai Verifikator Final Finance untuk ${spklIds.length} dokumen SPKL terpilih.`,
          data: { url: '/spkl' },
        });
      }
      if (batchNotifs.length > 0) {
        notify(batchNotifs);
      }

      res.json({
        success: true,
        message: `Berhasil mengalokasikan verifikator untuk ${spklIds.length} dokumen SPKL`,
      });
    } catch (error) {
      console.error('Error batch allocating verifiers:', error);
      res.status(500).json({ msg: 'Gagal memperbarui alokasi verifikator massal' });
    }
  }
);

// DELETE /api/spkl/:id - Delete draft or unapproved SPKL
router.delete(
  '/:id',
  auth,
  authorize('owner', 'president_director', 'operational_director', 'director', 'supervisor', 'site_manager'),
  async (req, res) => {
    try {
      const spkl = await SPKL.findById(req.params.id);
      if (!spkl) return res.status(404).json({ msg: 'SPKL tidak ditemukan' });

      if (spkl.workflowStatus === 'finance_verified') {
        return res.status(400).json({ msg: 'SPKL yang telah diverifikasi final oleh Finance tidak dapat dihapus' });
      }

      await SPKL.findByIdAndDelete(req.params.id);
      res.json({ success: true, message: 'Dokumen SPKL berhasil dihapus' });
    } catch (error) {
      console.error('Error deleting SPKL:', error);
      res.status(500).json({ msg: 'Gagal menghapus SPKL' });
    }
  }
);

module.exports = router;
