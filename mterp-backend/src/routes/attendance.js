const express = require('express');
const { Attendance, User, Project, AttendanceSession } = require('../models');
const { auth, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimiter');
const { wibDayRange, nowWIB } = require('../utils/date');

const router = express.Router();

const OFFICE_ROLES = [
  'owner',
  'president_director',
  'operational_director',
  'director',
  'admin_project',
  'asset_admin',
  'device_admin'
];

/**
 * Checks whether an attendance record or user belongs to Office & Management
 */
const isOfficeRecord = (record) => {
  if (!record) return false;
  if (record.category === 'office') return true;
  if (record.workType && ['WFO', 'WFH', 'Dinas'].includes(record.workType)) return true;
  const role = record.userId?.role || record.role;
  if (role && OFFICE_ROLES.includes(role)) return true;
  return false;
};

// GET /api/attendance/projects - All active projects for check-in (available to all roles)
router.get('/projects', auth, async (req, res) => {
  try {
    const projects = await Project.find({ status: { $ne: 'Completed' } })
      .select('_id nama lokasi status assignedTo')
      .populate('assignedTo', '_id fullName role position')
      .sort({ createdAt: -1 })
      .lean();
    res.json(projects);
  } catch (error) {
    console.error('Get attendance projects error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/attendance/workers - All workers for attendance tagging & offline cache
router.get('/workers', auth, async (req, res) => {
  try {
    const workers = await User.find({
      role: { $in: ['worker', 'tukang', 'helper', 'foreman', 'supervisor', 'site_manager', 'admin_project', 'asset_admin'] }
    })
      .select('_id fullName username role position profileImage')
      .sort({ fullName: 1 })
      .lean();
    res.json(workers);
  } catch (error) {
    console.error('Get attendance workers error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// ─── Timezone configuration ───────────────────────────────────────────────────
// Using standardized WIB date utilities from src/utils/date.js

/**
 * Returns "today" midnight in the WIB timezone, stored as a UTC Date.
 */
function getTodayStart(dateInput) {
  const range = wibDayRange(dateInput || nowWIB());
  return range ? range.start : new Date(); // fallback if range is somehow null
}

function isValidDateStr(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function parseDateParam(dateStr, endOfDay = false) {
  if (!isValidDateStr(dateStr)) return null;
  const range = wibDayRange(dateStr);
  if (!range) return null;
  return endOfDay ? range.end : range.start;
}

/**
 * Ensures any attendance record that doesn't have an individual checkIn photo,
 * but was part of a group attendance session (AttendanceSession), gets the session's
 * group photo attached as proof of attendance.
 */
async function attachGroupPhotoProof(records) {
  if (!records || records.length === 0) return records;

  const missingPhoto = records.filter(r => !r.checkIn?.photo);
  if (missingPhoto.length === 0) return records;

  const stillMissing = [];
  for (const r of missingPhoto) {
    if (r.sessionId?.photoUrl) {
      if (!r.checkIn) r.checkIn = {};
      r.checkIn.photo = r.sessionId.photoUrl;
      r.checkIn.isGroupPhoto = true;
      Attendance.updateOne(
        { _id: r._id },
        { $set: { 'checkIn.photo': r.sessionId.photoUrl } }
      ).catch(() => {});
    } else {
      stillMissing.push(r);
    }
  }

  if (stillMissing.length === 0) return records;

  try {
    const dates = [...new Set(stillMissing.map(r => {
      const d = new Date(r.date);
      return d.toISOString().split('T')[0];
    }))];

    const dayRanges = dates.map(ds => wibDayRange(ds)).filter(Boolean);
    if (dayRanges.length > 0) {
      const sessionQuery = {
        $or: dayRanges.map(dr => ({ date: { $gte: dr.start, $lte: dr.end } })),
      };

      const sessions = await AttendanceSession.find(sessionQuery)
        .select('_id date photoUrl workerIds lateWorkerIds notes supervisorId')
        .populate('supervisorId', 'fullName role')
        .lean();

      if (sessions.length > 0) {
        for (const r of stillMissing) {
          const rDate = new Date(r.date).getTime();
          const rUserId = (r.userId?._id || r.userId)?.toString();

          const matchingSession = sessions.find(s => {
            const sDate = new Date(s.date).getTime();
            const isSameDay = Math.abs(sDate - rDate) < 24 * 60 * 60 * 1000;
            if (!isSameDay) return false;

            const inWorkers = s.workerIds?.some(id => id.toString() === rUserId);
            const inLate = s.lateWorkerIds?.some(lw => (lw.workerId?._id || lw.workerId)?.toString() === rUserId);
            return inWorkers || inLate;
          });

          if (matchingSession && matchingSession.photoUrl) {
            if (!r.checkIn) r.checkIn = {};
            r.checkIn.photo = matchingSession.photoUrl;
            r.checkIn.isGroupPhoto = true;
            r.sessionId = matchingSession;

            Attendance.updateOne(
              { _id: r._id },
              { 
                $set: { 
                  sessionId: matchingSession._id,
                  'checkIn.photo': matchingSession.photoUrl 
                } 
              }
            ).catch(() => {});
          }
        }
      }
    }
  } catch (err) {
    console.error('attachGroupPhotoProof error:', err);
  }

  return records;
}

// GET /api/attendance - Get attendance records
router.get('/', auth, async (req, res) => {
  try {
    const { userId, startDate, endDate, workforceType, workType } = req.query;
    
    let query = {};
    
    // Default sort by date desc
    let sort = { date: -1 };

    // Filter by user (workers can only see their own)
    if (req.user.role === 'worker') {
      query.userId = req.user._id;
    } else if (userId) {
      query.userId = userId;
    }
    
    // Date range filter — use timezone-aware parser so dates match stored values
    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        const d = parseDateParam(startDate, false);
        if (!d) return res.status(400).json({ msg: 'Invalid startDate. Use YYYY-MM-DD.' });
        query.date.$gte = d;
      }
      if (endDate) {
        const d = parseDateParam(endDate, true);
        if (!d) return res.status(400).json({ msg: 'Invalid endDate. Use YYYY-MM-DD.' });
        query.date.$lte = d;
      }
    }
    
    let rawAttendance = (await Attendance.find(query)
      .populate('userId', 'fullName role profileImage')
      .populate('projectId', 'nama lokasi')
      .populate('sessionId', 'photoUrl notes createdAt')
      .sort({ date: -1 })
      .lean())
      .filter(a => a.userId); // Filter out records with deleted users

    // Workforce filtering (Office & Management vs Field Workforce)
    if (workforceType === 'office') {
      rawAttendance = rawAttendance.filter(a => isOfficeRecord(a));
    } else if (workforceType === 'field') {
      rawAttendance = rawAttendance.filter(a => !isOfficeRecord(a));
    }

    if (workType && workType !== 'all') {
      rawAttendance = rawAttendance.filter(a => a.workType === workType);
    }

    const attendance = await attachGroupPhotoProof(rawAttendance);
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
    
    let attendance = await Attendance.findOne({
      userId: req.user._id,
      date: today,
    })
      .populate('sessionId', 'photoUrl notes createdAt')
      .lean();
    
    if (attendance) {
      const [enriched] = await attachGroupPhotoProof([attendance]);
      attendance = enriched;
    }

    res.json(attendance || null);
  } catch (error) {
    console.error('Get today attendance error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/attendance/recap - Get attendance recap/summary
router.get('/recap', auth, async (req, res) => {
  try {
    const { startDate, endDate, userId, projectId, workforceType, workType } = req.query;
    
    let query = {};
    
    // Workers can only see their own
    if (req.user.role === 'worker') {
      query.userId = req.user._id;
    } else if (userId) {
      query.userId = userId;
    }

    if (projectId) {
      query.projectId = projectId;
    }
    
    // Date range filter — use timezone-aware parser so dates match stored values
    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        const d = parseDateParam(startDate, false);
        if (!d) return res.status(400).json({ msg: 'Invalid startDate. Use YYYY-MM-DD.' });
        query.date.$gte = d;
      }
      if (endDate) {
        const d = parseDateParam(endDate, true);
        if (!d) return res.status(400).json({ msg: 'Invalid endDate. Use YYYY-MM-DD.' });
        query.date.$lte = d;
      }
    }
    
    let rawAttendance = (await Attendance.find(query)
      .populate('userId', 'fullName role position profileImage')
      .populate('projectId', 'nama lokasi')
      .populate('sessionId', 'photoUrl notes createdAt')
      .sort({ date: -1 })
      .lean())
      .filter(a => a.userId); // Filter out records with deleted users

    // Workforce filtering (Office & Management vs Field Workforce)
    if (workforceType === 'office') {
      rawAttendance = rawAttendance.filter(a => isOfficeRecord(a));
    } else if (workforceType === 'field') {
      rawAttendance = rawAttendance.filter(a => !isOfficeRecord(a));
    }

    if (workType && workType !== 'all') {
      rawAttendance = rawAttendance.filter(a => a.workType === workType);
    }

    const attendance = await attachGroupPhotoProof(rawAttendance);
    
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
      // Sum overtime hours (use stored overtimeHours if available, otherwise calculate)
      if (a.overtimeHours !== undefined && a.overtimeHours !== null && a.overtimeHours > 0) {
        summary.totalOvertimeHours += a.overtimeHours;
      } else if (a.overtimePay > 0 && a.hourlyRate > 0) {
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
router.post('/checkin', auth, uploadLimiter, upload.single('photo'), async (req, res) => {
  try {
    const { projectId, lat, lng, clientTime, workType, officeLocation, notes } = req.body;
    
    // Parse client time or current time
    let recordTime = nowWIB();
    if (clientTime) {
      const parsed = new Date(clientTime);
      if (!isNaN(parsed.getTime())) {
        recordTime = parsed;
      }
    }

    const isOfficeUser = OFFICE_ROLES.includes(req.user.role) || ['WFO', 'WFH', 'Dinas'].includes(workType);

    // 1. Time Validation (08:00 - 16:00) - evaluate at recordTime in WIB timezone
    const localHour = parseInt(
      new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', hour: 'numeric', hourCycle: 'h23' }).format(recordTime),
      10
    );
    const hour = localHour;
    
    // Strict time validation only for field workers
    if (req.user.role === 'worker' || req.user.role === 'tukang' || req.user.role === 'helper') {
      if (hour < 8 || hour >= 16) {
        return res.status(400).json({ msg: 'Check-in is only allowed between 08:00 and 16:00' });
      }
    }

    // 2. Project Validation - Required for site workers, optional for office & management
    if (!isOfficeUser && !projectId) {
      return res.status(400).json({ msg: 'Please select a project to check in' });
    }
    
    const today = getTodayStart(recordTime);
    
    // Check if already checked in today
    let attendance = await Attendance.findOne({
      userId: req.user._id,
      date: today,
    });
    
    if (attendance && attendance.checkIn?.time) {
      return res.status(400).json({ msg: 'Already checked in today' });
    }

    const checkInPhoto = req.file ? req.file.path : (req.body.photoUrl || undefined);
    
    const checkInData = {
      time: recordTime,
      location: lat && lng ? { lat: Number(lat), lng: Number(lng) } : undefined,
      photo: checkInPhoto,
    };

    const determinedWorkType = workType || (isOfficeUser ? 'WFO' : 'Project');
    const determinedOfficeLoc = officeLocation || (isOfficeUser ? (determinedWorkType === 'WFH' ? 'Remote (Rumah)' : determinedWorkType === 'Dinas' ? 'Dinas Luar' : 'Kantor Pusat - Jakarta') : '');
    const determinedCategory = isOfficeUser ? 'office' : 'site';
    
    if (attendance) {
      attendance.checkIn = checkInData;
      if (projectId) attendance.projectId = projectId;
      attendance.status = 'Present';
      attendance.workType = determinedWorkType;
      attendance.officeLocation = determinedOfficeLoc;
      attendance.category = determinedCategory;
      if (notes) attendance.notes = notes;
    } else {
      attendance = new Attendance({
        userId: req.user._id,
        date: today,
        checkIn: checkInData,
        wageType: 'daily',
        wageMultiplier: 1,
        projectId: projectId || undefined,
        status: 'Present',
        workType: determinedWorkType,
        officeLocation: determinedOfficeLoc,
        category: determinedCategory,
        notes: notes || '',
      });
    }
    
    await attendance.save();
    await attendance.populate('userId', 'fullName role position profileImage');
    if (projectId) {
      await attendance.populate('projectId', 'nama lokasi');
    }
    
    res.status(201).json(attendance);
  } catch (error) {
    console.error('Check in error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/attendance/permit - Create permit request (leave, sick, business trip, etc.)
router.post('/permit', auth, uploadLimiter, upload.single('evidence'), async (req, res) => {
  try {
    const { reason, clientTime, permitType } = req.body;
    const isOffice = OFFICE_ROLES.includes(req.user.role);
    
    if (!reason) {
      return res.status(400).json({ msg: 'Reason is required' });
    }
    if (!req.file && !isOffice) {
      return res.status(400).json({ msg: 'Evidence photo is required' });
    }

    let recordTime = nowWIB();
    if (clientTime) {
      const parsed = new Date(clientTime);
      if (!isNaN(parsed.getTime())) {
        recordTime = parsed;
      }
    }

    const today = getTodayStart(recordTime);

    // Check if record exists
    let attendance = await Attendance.findOne({
      userId: req.user._id,
      date: today,
    });

    const permitData = {
      reason,
      evidence: req.file ? req.file.path : undefined,
      permitType: permitType || 'Izin',
      status: 'Pending',
    };

    if (attendance) {
      if (attendance.checkIn?.time) {
        return res.status(400).json({ msg: 'Cannot request permit, you are already checked in.' });
      }
      attendance.status = 'Permit';
      attendance.category = isOffice ? 'office' : 'site';
      attendance.permit = permitData;
    } else {
      attendance = new Attendance({
        userId: req.user._id,
        date: today,
        status: 'Permit',
        category: isOffice ? 'office' : 'site',
        permit: permitData,
      });
    }

    await attendance.save();
    res.status(201).json(attendance);
  } catch (error) {
    console.error('Permit request error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/attendance/checkout - Check out (with selfie photo supported & daily workSummary)
router.put('/checkout', auth, uploadLimiter, upload.single('photo'), async (req, res) => {
  try {
    const { lat, lng, clientTime, workSummary, notes } = req.body;
    
    let recordTime = nowWIB();
    if (clientTime) {
      const parsed = new Date(clientTime);
      if (!isNaN(parsed.getTime())) {
        recordTime = parsed;
      }
    }

    const today = getTodayStart(recordTime);
    
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
    
    const isOffice = OFFICE_ROLES.includes(req.user.role) || attendance.category === 'office';
    if (!req.file && !isOffice) {
      return res.status(400).json({ msg: 'Selfie photo is required for check-out' });
    }
    
    attendance.checkOut = {
      time: recordTime,
      photo: req.file ? req.file.path : (attendance.checkOut?.photo || undefined),
      location: lat && lng ? { lat: Number(lat), lng: Number(lng) } : undefined,
    };

    if (workSummary) {
      attendance.workSummary = workSummary;
    }
    if (notes) {
      attendance.notes = attendance.notes ? `${attendance.notes} | ${notes}` : notes;
    }
    
    await attendance.save();
    await attendance.populate('userId', 'fullName role position profileImage');

    // Auto-close supervisor's sessions today if all workers have already left
    try {
      const todaySessions = await AttendanceSession.find({
        supervisorId: req.user._id,
        date: today,
        status: { $ne: 'closed' },
      });

      for (const sess of todaySessions) {
        const allWIds = [
          ...(sess.workerIds || []).map(id => id.toString()),
          ...(sess.lateWorkerIds || []).map(lw => (lw.workerId?._id || lw.workerId).toString()),
        ];
        const leftWIds = (sess.leaveRecords || []).map(lr => (lr.workerId?._id || lr.workerId).toString());
        if (allWIds.length > 0 && allWIds.every(id => leftWIds.includes(id))) {
          sess.status = 'closed';
          sess.closedAt = recordTime;
          sess.closedBy = req.user._id;
          await sess.save();
        }
      }
    } catch (sErr) {
      console.error('Auto close session on supervisor checkout error:', sErr);
    }
    
    res.json(attendance);
  } catch (error) {
    console.error('Check out error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/attendance/office-today - Get today's office and management staff presence overview
router.get('/office-today', auth, async (req, res) => {
  try {
    const today = getTodayStart();

    // Find all users who are office/management
    const officeUsers = await User.find({
      role: { $in: OFFICE_ROLES },
      isVerified: true,
    })
      .select('_id fullName username role position profileImage phone email')
      .sort({ fullName: 1 })
      .lean();

    const officeUserIds = officeUsers.map(u => u._id);

    // Fetch attendance for these users today or any attendance with category='office'
    const todayRecords = await Attendance.find({
      date: today,
      $or: [
        { userId: { $in: officeUserIds } },
        { category: 'office' },
      ],
    })
      .populate('userId', '_id fullName username role position profileImage phone email')
      .lean();

    const recordMap = new Map();
    todayRecords.forEach(rec => {
      const uId = (rec.userId?._id || rec.userId)?.toString();
      if (uId) recordMap.set(uId, rec);
    });

    const staffList = officeUsers.map(u => {
      const record = recordMap.get(u._id.toString()) || null;
      return {
        user: u,
        record,
        status: record ? record.status : 'Absent',
        workType: record?.workType || (record ? 'WFO' : '-'),
        officeLocation: record?.officeLocation || '',
        checkInTime: record?.checkIn?.time || null,
        checkInPhoto: record?.checkIn?.photo || null,
        checkOutTime: record?.checkOut?.time || null,
        checkOutPhoto: record?.checkOut?.photo || null,
        workSummary: record?.workSummary || '',
      };
    });

    const summary = {
      totalOfficeStaff: officeUsers.length,
      present: staffList.filter(s => s.status === 'Present' || s.checkInTime).length,
      wfoCount: staffList.filter(s => s.workType === 'WFO' && s.checkInTime).length,
      wfhCount: staffList.filter(s => s.workType === 'WFH' && s.checkInTime).length,
      dinasCount: staffList.filter(s => s.workType === 'Dinas' && s.checkInTime).length,
      permitCount: staffList.filter(s => s.status === 'Permit').length,
      absentCount: staffList.filter(s => !s.checkInTime && s.status !== 'Permit').length,
    };

    res.json({ staff: staffList, summary });
  } catch (error) {
    console.error('Get office-today error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/attendance/recap-table - Tabular attendance recap for supervisors
router.get('/recap-table', auth, authorize('owner', 'president_director', 'operational_director', 'director', 'supervisor', 'site_manager', 'admin_project', 'asset_admin'), async (req, res) => {
  try {
    const { startDate, endDate, projectId, search, page = 1, limit = 10, workforceType } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ msg: 'startDate and endDate are required' });
    }

    // 1. Build attendance query — timezone-aware parser keeps dates consistent with storage
    const gteDate = parseDateParam(startDate, false);
    const lteDate = parseDateParam(endDate, true);
    if (!gteDate || !lteDate) {
      return res.status(400).json({ msg: 'Invalid date format. Use YYYY-MM-DD.' });
    }
    const attendanceQuery = {
      date: { $gte: gteDate, $lte: lteDate },
    };
    if (projectId) attendanceQuery.projectId = projectId;

    // 2. Fetch all attendance records in range
    let allRecords = (await Attendance.find(attendanceQuery)
      .populate('userId', 'fullName role position')
      .populate('projectId', 'nama')
      .lean())
      .filter(a => a.userId); // Filter out records with deleted users

    // Workforce filtering (Office & Management vs Field Workforce)
    if (workforceType === 'office') {
      allRecords = allRecords.filter(a => isOfficeRecord(a));
    } else if (workforceType === 'field') {
      allRecords = allRecords.filter(a => !isOfficeRecord(a));
    }

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
          totalOvertimeHours: 0,
        };
      }
      // We can use wibDayRange logic directly or Intl object to get WIB date string
      const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date(record.date));
      let score = 0;
      if (record.status === 'Present') score = 1;
      else if (record.status === 'Late') score = 0.5;
      else if (record.status === 'Half-day') score = 0.5;
      else if (record.status === 'Absent') score = 0;
      else if (record.status === 'Permit') score = 0;

      // Calculate overtime hours for this record
      let overtimeHours = 0;
      if (record.overtimeHours !== undefined && record.overtimeHours !== null && record.overtimeHours > 0) {
        overtimeHours = record.overtimeHours;
      } else if (record.overtimePay > 0 && record.hourlyRate > 0) {
        overtimeHours = Math.round((record.overtimePay / record.hourlyRate) * 10) / 10;
      } else if (record.overtimePay > 0 && record.dailyRate > 0) {
        overtimeHours = Math.round((record.overtimePay / (record.dailyRate / 8)) * 10) / 10;
      }

      workerMap[uid].days[dateKey] = {
        attendanceId: record._id,
        status: record.status,
        score,
        overtimeHours,
        checkInTime: record.checkIn?.time,
        checkOutTime: record.checkOut?.time,
        projectId: record.projectId?._id || record.projectId,
        projectName: record.projectId?.nama,
        dailyRate: record.dailyRate || 0,
        overtimePay: record.overtimePay || 0,
        notes: record.notes || '',
        workType: record.workType || '',
        officeLocation: record.officeLocation || '',
        workSummary: record.workSummary || '',
        permitReason: record.permit?.reason || '',
      };
      workerMap[uid].totalScore += score;
      if (record.dailyRate > 0) workerMap[uid].dailyRate = record.dailyRate;

      // Accumulate overtime hours per worker
      workerMap[uid].totalOvertimeHours += overtimeHours;
    });

    // 5. Convert to array and format total
    let workers = Object.values(workerMap).map(w => ({
      ...w,
      totalOvertimeHours: Math.round((w.totalOvertimeHours || 0) * 10) / 10,
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

    // 8. Calculate summary BEFORE pagination with accurate status weighting
    const totalWorkforce = workers.length;
    const totalPossibleDays = totalWorkforce * dateColumns.length;
    const totalActualScore = workers.reduce((sum, w) => sum + w.totalScore, 0);
    const avgAttendance = totalPossibleDays > 0 ? Math.round((totalActualScore / totalPossibleDays) * 1000) / 10 : 0;
    const pendingPayroll = allRecords
      .filter(r => (r.paymentStatus || 'Unpaid') === 'Unpaid')
      .reduce((sum, r) => {
        if (r.status === 'Absent' || r.status === 'Permit') return sum;
        const daily = r.status === 'Half-day' ? Math.round((r.dailyRate || 0) / 2) : (r.dailyRate || 0);
        const ot = r.overtimePay || 0;
        return sum + daily + ot;
      }, 0);
    const totalOvertimeHours = Math.round(workers.reduce((sum, w) => sum + (w.totalOvertimeHours || 0), 0) * 10) / 10;

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
        totalOvertimeHours,
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
router.get('/recap-table/export-excel', auth, authorize('owner', 'president_director', 'operational_director', 'director', 'supervisor', 'site_manager', 'admin_project', 'asset_admin'), async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const { startDate, endDate, projectId, search, workforceType } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ msg: 'startDate and endDate are required' });
    }

    // Timezone-aware date bounds match how records are stored by getTodayStart()
    const attendanceQuery = {
      date: {
        $gte: parseDateParam(startDate, false),
        $lte: parseDateParam(endDate, true),
      },
    };
    if (projectId) attendanceQuery.projectId = projectId;

    let allRecords = (await Attendance.find(attendanceQuery)
      .populate('userId', 'fullName role position')
      .populate('projectId', 'nama')
      .lean())
      .filter(a => a.userId); // Filter out records with deleted users

    // Workforce filtering (Office & Management vs Field Workforce)
    if (workforceType === 'office') {
      allRecords = allRecords.filter(a => isOfficeRecord(a));
    } else if (workforceType === 'field') {
      allRecords = allRecords.filter(a => !isOfficeRecord(a));
    }

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
      const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date(record.date));
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
       if (req.body.overtimeHours !== undefined) {
         attendance.overtimeHours = Number(req.body.overtimeHours);
       } else if (attendance.hourlyRate > 0) {
         attendance.overtimeHours = Math.round((attendance.overtimePay / attendance.hourlyRate) * 10) / 10;
       }
    } else if (attendance.wageType.startsWith('overtime') && attendance.checkIn?.time && attendance.checkOut?.time) {
       const hours = Math.max(0, (new Date(attendance.checkOut.time) - new Date(attendance.checkIn.time)) / (1000 * 60 * 60));
       attendance.overtimeHours = Math.round(hours * 10) / 10;
       attendance.overtimePay = Math.round(hours * attendance.hourlyRate * attendance.wageMultiplier);
    } else {
       // If not overtime type and no manual override, default to 0
       attendance.overtimePay = 0;
       attendance.overtimeHours = 0;
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
          paidAt: nowWIB() 
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
    attendance.invalidatedAt = nowWIB();
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

// PUT /api/attendance/recap-table/adjust - Fast inline attendance adjustment for recap matrix
router.put('/recap-table/adjust', auth, authorize('owner', 'president_director', 'operational_director', 'director', 'supervisor', 'site_manager', 'admin_project', 'asset_admin'), async (req, res) => {
  try {
    const {
      userId,
      date,
      status,
      overtimeHours,
      checkInTime,
      checkOutTime,
      projectId,
      dailyRate,
      notes,
    } = req.body;

    if (!userId || !date) {
      return res.status(400).json({ msg: 'userId and date are required' });
    }

    const validStatuses = ['Present', 'Late', 'Half-day', 'Absent', 'Permit'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ msg: `Status must be one of: ${validStatuses.join(', ')}` });
    }

    const startOfTargetDay = parseDateParam(date, false);
    const endOfTargetDay = parseDateParam(date, true);

    if (!startOfTargetDay || !endOfTargetDay) {
      return res.status(400).json({ msg: 'Invalid date format (YYYY-MM-DD expected)' });
    }

    let record = await Attendance.findOne({
      userId,
      date: { $gte: startOfTargetDay, $lte: endOfTargetDay },
    });

    const targetUser = await User.findById(userId).select('dailyRate');
    const existingRate = record?.dailyRate || 0;
    const userDailyRate = (dailyRate !== undefined && Number(dailyRate) >= 0)
      ? Number(dailyRate)
      : (existingRate > 0 ? existingRate : (targetUser?.dailyRate || 150000));
    const userHourlyRate = userDailyRate > 0 ? Math.round(userDailyRate / 8) : 18750;
    const otHours = Math.max(0, Number(overtimeHours) || 0);
    const calculatedOtPay = Math.round(otHours * userHourlyRate * 1.5);

    // Parse checkIn and checkOut Date objects in WIB timezone
    let checkInDate = null;
    let checkOutDate = null;

    const targetStatus = status || record?.status || 'Present';
    if (['Present', 'Late', 'Half-day'].includes(targetStatus)) {
      const inTimeStr = checkInTime || (targetStatus === 'Late' ? '09:30' : '08:00');
      const outTimeStr = checkOutTime || (targetStatus === 'Half-day' ? '12:00' : '17:00');

      if (/^\d{1,2}:\d{2}$/.test(inTimeStr)) {
        const [h, m] = inTimeStr.split(':').map(Number);
        const padH = String(h).padStart(2, '0');
        const padM = String(m).padStart(2, '0');
        checkInDate = new Date(`${date}T${padH}:${padM}:00+07:00`);
      }
      if (/^\d{1,2}:\d{2}$/.test(outTimeStr)) {
        const [h, m] = outTimeStr.split(':').map(Number);
        const padH = String(h).padStart(2, '0');
        const padM = String(m).padStart(2, '0');
        checkOutDate = new Date(`${date}T${padH}:${padM}:00+07:00`);
      }
    }

    if (record) {
      if (status) record.status = status;
      record.dailyRate = targetStatus === 'Absent' ? 0 : (targetStatus === 'Half-day' ? Math.round(userDailyRate / 2) : userDailyRate);
      record.hourlyRate = userHourlyRate;
      record.overtimeHours = targetStatus === 'Absent' ? 0 : otHours;
      record.overtimePay = targetStatus === 'Absent' ? 0 : calculatedOtPay;
      record.wageType = otHours > 0 ? 'overtime' : 'daily';
      record.wageMultiplier = 1;

      if (projectId) {
        record.projectId = projectId;
      }
      if (notes !== undefined) {
        record.notes = notes;
      }

      if (targetStatus === 'Absent') {
        record.checkIn = undefined;
        record.checkOut = undefined;
      } else if (targetStatus === 'Permit') {
        record.checkIn = undefined;
        record.checkOut = undefined;
        record.permit = {
          reason: notes || 'Izin / Sakit via Rekapitulasi',
          status: 'Approved',
        };
      } else {
        if (!record.checkIn) record.checkIn = {};
        if (checkInDate) record.checkIn.time = checkInDate;

        if (!record.checkOut) record.checkOut = {};
        if (checkOutDate) record.checkOut.time = checkOutDate;
      }

      record.invalidatedBy = undefined;
      record.invalidatedAt = undefined;
      await record.save();
    } else {
      record = new Attendance({
        userId,
        date: startOfTargetDay,
        status: targetStatus,
        dailyRate: targetStatus === 'Absent' ? 0 : (targetStatus === 'Half-day' ? Math.round(userDailyRate / 2) : userDailyRate),
        hourlyRate: userHourlyRate,
        overtimeHours: targetStatus === 'Absent' ? 0 : otHours,
        overtimePay: targetStatus === 'Absent' ? 0 : calculatedOtPay,
        wageType: otHours > 0 ? 'overtime' : 'daily',
        wageMultiplier: 1,
        paymentStatus: 'Unpaid',
        projectId: projectId || undefined,
        notes: notes || undefined,
        permit: targetStatus === 'Permit' ? {
          reason: notes || 'Izin / Sakit via Rekapitulasi',
          status: 'Approved',
        } : undefined,
        checkIn: ['Present', 'Late', 'Half-day'].includes(targetStatus) && checkInDate ? {
          time: checkInDate,
        } : undefined,
        checkOut: ['Present', 'Late', 'Half-day'].includes(targetStatus) && checkOutDate ? {
          time: checkOutDate,
        } : undefined,
      });
      await record.save();
    }

    const populatedRecord = await Attendance.findById(record._id)
      .populate('userId', 'fullName role position profileImage')
      .populate('projectId', 'nama lokasi');

    res.json({
      msg: 'Attendance adjusted successfully',
      record: populatedRecord,
    });
  } catch (error) {
    console.error('Adjust attendance error:', error);
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
      time: nowWIB(),
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

