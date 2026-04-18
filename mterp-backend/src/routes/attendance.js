const express = require('express');
const { Attendance, User, Project } = require('../models');
const { auth, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// GET /api/attendance/projects - All active projects for check-in (available to all roles)
router.get('/projects', auth, async (req, res) => {
  try {
    const projects = await Project.find({ status: { $ne: 'Completed' } })
      .select('_id nama lokasi status')
      .sort({ createdAt: -1 })
      .lean();
    res.json(projects);
  } catch (error) {
    console.error('Get attendance projects error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Timezone-safe helper: get start of today in the configured timezone
// Default UTC+7 (WIB - Indonesia Western Time)
const TZ_OFFSET_HOURS = parseInt(process.env.TZ_OFFSET_HOURS || '7', 10);

function getTodayStart() {
  const now = new Date();
  // Shift to target timezone, then truncate to midnight, then shift back to UTC
  const localMs = now.getTime() + (TZ_OFFSET_HOURS * 60 * 60 * 1000);
  const localDay = new Date(localMs);
  localDay.setUTCHours(0, 0, 0, 0);
  return new Date(localDay.getTime() - (TZ_OFFSET_HOURS * 60 * 60 * 1000));
}

// GET /api/attendance - Get attendance records
router.get('/', auth, async (req, res) => {
  try {
    const { userId, startDate, endDate } = req.query;
    
    let query = {};
    
    // Default sort by date desc
    let sort = { date: -1 };

    // Filter by user (workers can only see their own)
    if (req.user.role === 'worker') {
      query.userId = req.user._id;
    } else if (userId) {
      query.userId = userId;
    }
    
    // Date range filter
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }
    
    const attendance = await Attendance.find(query)
      .populate('userId', 'fullName role')
      .populate('projectId', 'nama')
      .sort({ date: -1 })
      .lean();
    
    res.json(attendance);
  } catch (error) {
    console.error('Get attendance error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/attendance/today - Get today's attendance for current user
router.get('/today', auth, async (req, res) => {
  try {
    const today = getTodayStart();
    
    const attendance = await Attendance.findOne({
      userId: req.user._id,
      date: today,
    }).lean();
    
    res.json(attendance || null);
  } catch (error) {
    console.error('Get today attendance error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/attendance/recap - Get attendance recap/summary
router.get('/recap', auth, async (req, res) => {
  try {
    const { startDate, endDate, userId } = req.query;
    
    let query = {};
    
    // Workers can only see their own
    if (req.user.role === 'worker') {
      query.userId = req.user._id;
    } else if (userId) {
      query.userId = userId;
    }
    
    // Date range filter
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }
    
    const attendance = await Attendance.find(query)
      .populate('userId', 'fullName role')
      .sort({ date: -1 })
      .lean();
    
    // Calculate summary
    const summary = {
      total: attendance.length,
      present: attendance.filter(a => a.status === 'Present').length,
      late: attendance.filter(a => a.status === 'Late').length,
      absent: attendance.filter(a => a.status === 'Absent').length,
      totalHours: 0,
      totalOvertimeHours: 0,
      wageMultiplierTotal: 0,
    };
    
    // Calculate hours worked
    attendance.forEach(a => {
      if (a.checkIn?.time && a.checkOut?.time) {
        const hours = (new Date(a.checkOut.time) - new Date(a.checkIn.time)) / (1000 * 60 * 60);
        summary.totalHours += hours;
      }
      summary.wageMultiplierTotal += a.wageMultiplier || 1;
      // Sum overtime hours
      if (a.overtimePay > 0 && a.hourlyRate > 0) {
        summary.totalOvertimeHours += a.overtimePay / a.hourlyRate;
      } else if (a.overtimePay > 0 && a.dailyRate > 0) {
        summary.totalOvertimeHours += a.overtimePay / (a.dailyRate / 8);
      }
    });
    summary.totalHours = Math.round(summary.totalHours * 10) / 10;
    summary.totalOvertimeHours = Math.round(summary.totalOvertimeHours * 10) / 10;
    
    // Calculate total payment
    summary.totalPayment = attendance.reduce((sum, a) => {
      // Daily rate + Overtime
      const daily = a.dailyRate || 0;
      const overtime = a.overtimePay || 0;
      return sum + daily + overtime;
    }, 0);
    
    res.json({ records: attendance, summary });
  } catch (error) {
    console.error('Get attendance recap error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/attendance/users - Get list of users for filtering (supervisors+)
router.get('/users', auth, authorize('owner', 'president_director', 'operational_director', 'director', 'supervisor', 'asset_admin'), async (req, res) => {
  try {
    const users = await User.find({ isVerified: true })
      .select('_id fullName role')
      .sort({ fullName: 1 })
      .lean();
    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/attendance/checkin - Check in with time & project validation
router.post('/checkin', auth, async (req, res) => {
  try {
    const { projectId, lat, lng } = req.body;
    
    // 1. Time Validation (08:00 - 16:00) - use local timezone, not UTC
    const now = new Date();
    const localHour = (now.getUTCHours() + TZ_OFFSET_HOURS) % 24;
    const hour = localHour;
    
    // Allow supervisor/admin to bypass? For now, strict for everyone or just workers?
    // User request: "outside of that time worker cant check in"
    // Assuming strict for workers.
    if (req.user.role === 'worker') {
      if (hour < 8 || hour >= 16) {
        return res.status(400).json({ msg: 'Check-in is only allowed between 08:00 and 16:00' });
      }
    }

    // 2. Project Validation
    if (!projectId) {
      return res.status(400).json({ msg: 'Please select a project to check in' });
    }
    
    const today = getTodayStart();
    
    // Check if already checked in today
    let attendance = await Attendance.findOne({
      userId: req.user._id,
      date: today,
    });
    
    if (attendance && attendance.checkIn?.time) {
      return res.status(400).json({ msg: 'Already checked in today' });
    }
    
    const checkInData = {
      time: new Date(),
      location: lat && lng ? { lat: Number(lat), lng: Number(lng) } : undefined,
    };
    
    if (attendance) {
      attendance.checkIn = checkInData;
      attendance.projectId = projectId;
    } else {
      attendance = new Attendance({
        userId: req.user._id,
        date: today,
        checkIn: checkInData,
        wageType: 'daily',
        wageMultiplier: 1,
        projectId: projectId,
        status: 'Present',
      });
    }
    
    await attendance.save();
    await attendance.populate('userId', 'fullName');
    
    res.status(201).json(attendance);
  } catch (error) {
    console.error('Check in error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/attendance/permit - Create permit request
router.post('/permit', auth, uploadLimiter, upload.single('evidence'), async (req, res) => {
  try {
    const { reason } = req.body;
    
    if (!reason || !req.file) {
      return res.status(400).json({ msg: 'Reason and evidence photo are required' });
    }

    const today = getTodayStart();

    // Check if record exists
    let attendance = await Attendance.findOne({
      userId: req.user._id,
      date: today,
    });

    if (attendance) {
      if (attendance.checkIn?.time) {
        return res.status(400).json({ msg: 'Cannot request permit, you are already checked in.' });
      }
      attendance.status = 'Permit';
      attendance.permit = {
        reason,
        evidence: req.file.path,
        status: 'Pending',
      };
    } else {
      attendance = new Attendance({
        userId: req.user._id,
        date: today,
        status: 'Permit',
        permit: {
          reason,
          evidence: req.file.path,
          status: 'Pending',
        },
      });
    }

    await attendance.save();
    res.status(201).json(attendance);
  } catch (error) {
    console.error('Permit request error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/attendance/checkout - Check out (with selfie photo required)
router.put('/checkout', auth, uploadLimiter, upload.single('photo'), async (req, res) => {
  try {
    const { lat, lng } = req.body;
    
    const today = getTodayStart();
    
    const attendance = await Attendance.findOne({
      userId: req.user._id,
      date: today,
    });
    
    if (!attendance) {
      return res.status(400).json({ msg: 'No check-in record found for today' });
    }
    
    if (attendance.checkOut?.time) {
      return res.status(400).json({ msg: 'Already checked out today' });
    }
    
    if (!req.file) {
      return res.status(400).json({ msg: 'Selfie photo is required for check-out' });
    }
    
    attendance.checkOut = {
      time: new Date(),
      photo: req.file.path,
      location: lat && lng ? { lat: Number(lat), lng: Number(lng) } : undefined,
    };
    
    await attendance.save();
    await attendance.populate('userId', 'fullName');
    
    res.json(attendance);
  } catch (error) {
    console.error('Check out error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/attendance/recap-table - Tabular attendance recap for supervisors
router.get('/recap-table', auth, authorize('owner', 'president_director', 'operational_director', 'director', 'supervisor', 'asset_admin'), async (req, res) => {
  try {
    const { startDate, endDate, projectId, search, page = 1, limit = 10 } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ msg: 'startDate and endDate are required' });
    }

    // 1. Build attendance query
    const attendanceQuery = {
      date: {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      },
    };
    if (projectId) attendanceQuery.projectId = projectId;

    // 2. Fetch all attendance records in range
    const allRecords = await Attendance.find(attendanceQuery)
      .populate('userId', 'fullName role position')
      .populate('projectId', 'nama')
      .lean();

    // 3. Generate date columns array
    const dateColumns = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      dateColumns.push(d.toISOString().split('T')[0]);
    }

    // 4. Group by userId and pivot into worker x date grid
    const workerMap = {};
    allRecords.forEach(record => {
      const uid = record.userId._id.toString();
      if (!workerMap[uid]) {
        workerMap[uid] = {
          userId: uid,
          fullName: record.userId.fullName,
          initials: record.userId.fullName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase(),
          role: record.userId.role,
          position: record.userId.position || record.userId.role,
          dailyRate: record.dailyRate || 0,
          days: {},
          totalScore: 0,
        };
      }
      const localMs = new Date(record.date).getTime() + (TZ_OFFSET_HOURS * 60 * 60 * 1000);
      const dateKey = new Date(localMs).toISOString().split('T')[0];
      let score = 0;
      if (record.status === 'Present') score = 1;
      else if (record.status === 'Late') score = 0.5;
      else if (record.status === 'Half-day') score = 0.5;
      else if (record.status === 'Absent') score = 0;
      else if (record.status === 'Permit') score = 0;

      workerMap[uid].days[dateKey] = {
        status: record.status,
        score,
      };
      workerMap[uid].totalScore += score;
      if (record.dailyRate > 0) workerMap[uid].dailyRate = record.dailyRate;
    });

    // 5. Convert to array and format total
    let workers = Object.values(workerMap).map(w => ({
      ...w,
      total: `${w.totalScore % 1 === 0 ? w.totalScore : w.totalScore.toFixed(1)}/${dateColumns.length}`,
    }));

    // 6. Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      workers = workers.filter(w =>
        w.fullName.toLowerCase().includes(searchLower) ||
        (w.position && w.position.toLowerCase().includes(searchLower))
      );
    }

    // 7. Sort by fullName
    workers.sort((a, b) => a.fullName.localeCompare(b.fullName));

    // 8. Calculate summary BEFORE pagination
    const totalWorkforce = workers.length;
    const totalPossibleDays = totalWorkforce * dateColumns.length;
    const totalActualScore = workers.reduce((sum, w) => sum + w.totalScore, 0);
    const avgAttendance = totalPossibleDays > 0 ? Math.round((totalActualScore / totalPossibleDays) * 1000) / 10 : 0;
    const pendingPayroll = allRecords
      .filter(r => (r.paymentStatus || 'Unpaid') === 'Unpaid')
      .reduce((sum, r) => sum + (r.dailyRate || 0) + (r.overtimePay || 0), 0);

    // 9. Paginate
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const total = workers.length;
    const paginatedWorkers = workers.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    res.json({
      workers: paginatedWorkers,
      dateColumns,
      summary: {
        totalWorkforce,
        avgAttendance,
        siteTarget: 90,
        pendingPayroll,
        payrollCycleStart: startDate,
        payrollCycleEnd: endDate,
      },
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Get attendance recap-table error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/attendance/recap-table/export-excel
router.get('/recap-table/export-excel', auth, authorize('owner', 'president_director', 'operational_director', 'director', 'supervisor', 'asset_admin'), async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const { startDate, endDate, projectId, search } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ msg: 'startDate and endDate are required' });
    }

    const attendanceQuery = {
      date: {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      },
    };
    if (projectId) attendanceQuery.projectId = projectId;

    const allRecords = await Attendance.find(attendanceQuery)
      .populate('userId', 'fullName role position')
      .populate('projectId', 'nama')
      .lean();

    const dateColumns = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      dateColumns.push(d.toISOString().split('T')[0]);
    }

    const workerMap = {};
    allRecords.forEach(record => {
      const uid = record.userId._id.toString();
      if (!workerMap[uid]) {
        workerMap[uid] = {
          fullName: record.userId.fullName,
          position: record.userId.position || record.userId.role,
          dailyRate: record.dailyRate || 0,
          days: {},
          totalScore: 0,
        };
      }
      const localMs = new Date(record.date).getTime() + (TZ_OFFSET_HOURS * 60 * 60 * 1000);
      const dateKey = new Date(localMs).toISOString().split('T')[0];
      let score = 0;
      if (record.status === 'Present') score = 1;
      else if (record.status === 'Late' || record.status === 'Half-day') score = 0.5;
      
      workerMap[uid].days[dateKey] = record.status;
      workerMap[uid].totalScore += score;
      if (record.dailyRate > 0) workerMap[uid].dailyRate = record.dailyRate;
    });

    let workers = Object.values(workerMap);
    if (search) {
      const searchLower = search.toLowerCase();
      workers = workers.filter(w =>
        w.fullName.toLowerCase().includes(searchLower) ||
        (w.position && w.position.toLowerCase().includes(searchLower))
      );
    }
    workers.sort((a, b) => a.fullName.localeCompare(b.fullName));

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Attendance Recap');

    // Define columns
    const columns = [
      { header: 'No', key: 'no', width: 5 },
      { header: 'Nama (Worker Name)', key: 'fullName', width: 25 },
      { header: 'Jabatan', key: 'position', width: 20 },
      { header: 'Upah Harian', key: 'dailyRate', width: 15 },
    ];

    dateColumns.forEach(date => {
      columns.push({ header: date, key: date, width: 12 });
    });

    columns.push({ header: 'Total', key: 'total', width: 10 });
    sheet.columns = columns;

    // Style header
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    // Fill data
    workers.forEach((worker, index) => {
      const rowData = {
        no: index + 1,
        fullName: worker.fullName,
        position: worker.position,
        dailyRate: worker.dailyRate,
        total: `${worker.totalScore}/${dateColumns.length}`,
      };
      
      dateColumns.forEach(date => {
        rowData[date] = worker.days[date] || '-';
      });

      sheet.addRow(rowData);
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=attendance-recap-${startDate}-to-${endDate}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export excel error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/attendance/:id/rate - Update rate/wage (supervisor only)
router.put('/:id/rate', auth, authorize('owner', 'president_director', 'operational_director', 'director', 'supervisor', 'asset_admin'), async (req, res) => {
  try {
    const { dailyRate, wageType, overtimePay } = req.body;
    
    const updates = {};
    
    // Basic Wage Type update
    if (wageType) {
      const wageMultipliers = {
        'daily': 1,
        'overtime_1.5': 1.5,
        'overtime_2': 2,
        'overtime': 1,
      };
      updates.wageType = wageType;
      updates.wageMultiplier = wageMultipliers[wageType] || 1;
    }

    // Rate calculation
    if (dailyRate !== undefined) {
      const rate = Number(dailyRate);
      updates.dailyRate = rate;
      updates.hourlyRate = rate / 8; // Auto-calculate hourly
    }
    
    // We need to fetch the record first to calculate overtime pay correctly based on existing data + updates
    let attendance = await Attendance.findById(req.params.id);
    if (!attendance) return res.status(404).json({ msg: 'Record not found' });

    // Merge updates
    Object.assign(attendance, updates);
    
    // Calculate Overtime Pay
    // Priority: 1. Manual Override (from body) 2. Auto-calculation (if wageType is overtime)
    if (overtimePay !== undefined) {
       attendance.overtimePay = Number(overtimePay);
    } else if (attendance.wageType.startsWith('overtime') && attendance.checkIn?.time && attendance.checkOut?.time) {
       const hours = Math.max(0, (new Date(attendance.checkOut.time) - new Date(attendance.checkIn.time)) / (1000 * 60 * 60));
       attendance.overtimePay = Math.round(hours * attendance.hourlyRate * attendance.wageMultiplier);
    } else {
       // If not overtime type and no manual override, default to 0
       attendance.overtimePay = 0;
    }

    await attendance.save();
    res.json(attendance);
  } catch (error) {
    console.error('Update rate error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/attendance/pay - Mark records as Paid (supervisor only)
router.post('/pay', auth, authorize('owner', 'president_director', 'operational_director', 'director', 'supervisor', 'asset_admin'), async (req, res) => {
  try {
    const { attendanceIds } = req.body; // Array of IDs
    
    if (!attendanceIds || !Array.isArray(attendanceIds) || attendanceIds.length === 0) {
      return res.status(400).json({ msg: 'No records selected' });
    }

    await Attendance.updateMany(
      { _id: { $in: attendanceIds } },
      { 
        $set: { 
          paymentStatus: 'Paid', 
          paidAt: new Date() 
        } 
      }
    );

    res.json({ msg: 'Payment status updated' });
  } catch (error) {
    console.error('Payment update error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/attendance/:id/invalidate - Supervisor invalidates accidental check-in
// Sets status to Absent or Permit and clears check-in/check-out data
router.put('/:id/invalidate', auth, authorize('owner', 'president_director', 'operational_director', 'director', 'supervisor', 'asset_admin'), async (req, res) => {
  try {
    const { newStatus, reason } = req.body;

    if (!['Absent', 'Permit'].includes(newStatus)) {
      return res.status(400).json({ msg: 'newStatus must be "Absent" or "Permit"' });
    }

    const attendance = await Attendance.findById(req.params.id);
    if (!attendance) return res.status(404).json({ msg: 'Attendance record not found' });

    // Clear check-in and check-out data
    attendance.checkIn = undefined;
    attendance.checkOut = undefined;

    // Set new status
    attendance.status = newStatus;

    // If invalidated as Permit, attach a minimal permit record with the reason
    if (newStatus === 'Permit') {
      attendance.permit = {
        reason: reason || 'Invalidated by supervisor',
        status: 'Approved', // auto-approved since supervisor is doing this
      };
    } else {
      // Clear any existing permit data
      attendance.permit = undefined;
    }

    // Audit trail
    attendance.invalidatedBy = req.user._id;
    attendance.invalidatedAt = new Date();
    attendance.invalidatedReason = reason || 'Accidental check-in invalidated by supervisor';

    await attendance.save();

    res.json({
      msg: `Attendance invalidated as ${newStatus}`,
      attendance,
    });
  } catch (error) {
    console.error('Invalidate attendance error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Legacy POST /api/attendance - for backwards compatibility

router.post('/', auth, uploadLimiter, upload.single('photo'), async (req, res) => {
  try {
    const { wageType, projectId, lat, lng } = req.body;
    
    const today = getTodayStart();
    
    let attendance = await Attendance.findOne({
      userId: req.user._id,
      date: today,
    });
    
    if (attendance && attendance.checkIn?.time) {
      return res.status(400).json({ msg: 'Already checked in today' });
    }
    
    const wageMultipliers = {
      'daily': 1,
      'overtime_1.5': 1.5,
      'overtime_2': 2,
      'overtime': 1,
    };
    
    const checkInData = {
      time: new Date(),
      photo: req.file ? req.file.path : undefined,
      location: lat && lng ? { lat: Number(lat), lng: Number(lng) } : undefined,
    };
    
    if (attendance) {
      attendance.checkIn = checkInData;
      attendance.wageType = wageType || 'daily';
      attendance.wageMultiplier = wageMultipliers[wageType] || 1;
    } else {
      attendance = new Attendance({
        userId: req.user._id,
        date: today,
        checkIn: checkInData,
        wageType: wageType || 'daily',
        wageMultiplier: wageMultipliers[wageType] || 1,
        projectId: projectId || undefined,
        status: 'Present',
      });
    }
    
    await attendance.save();
    await attendance.populate('userId', 'fullName');
    
    res.status(201).json(attendance);
  } catch (error) {
    console.error('Check in error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;

