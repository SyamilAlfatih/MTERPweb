const express = require('express');
const { Attendance, User } = require('../models');
const { auth, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

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
      .sort({ date: -1 });
    
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
    });
    
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
      .sort({ date: -1 });
    
    // Calculate summary
    const summary = {
      total: attendance.length,
      present: attendance.filter(a => a.status === 'Present').length,
      late: attendance.filter(a => a.status === 'Late').length,
      absent: attendance.filter(a => a.status === 'Absent').length,
      totalHours: 0,
      wageMultiplierTotal: 0,
    };
    
    // Calculate hours worked
    attendance.forEach(a => {
      if (a.checkIn?.time && a.checkOut?.time) {
        const hours = (new Date(a.checkOut.time) - new Date(a.checkIn.time)) / (1000 * 60 * 60);
        summary.totalHours += hours;
      }
      summary.wageMultiplierTotal += a.wageMultiplier || 1;
    });
    
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
router.get('/users', auth, authorize('owner', 'director', 'supervisor'), async (req, res) => {
  try {
    const users = await User.find({ isVerified: true })
      .select('_id fullName role')
      .sort({ fullName: 1 });
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
    
    // 1. Time Validation (08:00 - 16:00)
    const now = new Date();
    const hour = now.getHours();
    
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

// PUT /api/attendance/:id/rate - Update rate/wage (supervisor only)
router.put('/:id/rate', auth, authorize('owner', 'director', 'supervisor'), async (req, res) => {
  try {
    const { dailyRate, wageType, overtimePay } = req.body;
    
    const updates = {};
    
    // Basic Wage Type update
    if (wageType) {
      const wageMultipliers = {
        'daily': 1,
        'overtime_1.5': 1.5,
        'overtime_2': 2,
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
router.post('/pay', auth, authorize('owner', 'director', 'supervisor'), async (req, res) => {
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

