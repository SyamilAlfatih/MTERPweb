const express = require('express');
const bcrypt = require('bcryptjs');
const { User, Attendance, Kasbon, SlipGaji } = require('../models');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

// Auto-cleanup: drop old monthly index if it exists
(async () => {
    try {
        const indexes = await SlipGaji.collection.indexes();
        const oldIndex = indexes.find(idx =>
            idx.key && idx.key['period.month'] !== undefined && idx.key['period.year'] !== undefined
        );
        if (oldIndex) {
            await SlipGaji.collection.dropIndex(oldIndex.name);
            console.log('[SlipGaji] Dropped old monthly index:', oldIndex.name);
        }
    } catch (e) {
        // Ignore if collection doesn't exist yet
    }
})();

// Helper: generate slip number from dates
const generateSlipNumber = async (startDate, endDate) => {
    const s = new Date(startDate);
    const yy = s.getFullYear();
    const mm = String(s.getMonth() + 1).padStart(2, '0');
    const dd = String(s.getDate()).padStart(2, '0');
    const count = await SlipGaji.countDocuments({
        'period.startDate': { $gte: new Date(yy, s.getMonth(), 1) },
        'period.endDate': { $lte: new Date(yy, s.getMonth() + 1, 0, 23, 59, 59) },
    });
    const seq = String(count + 1).padStart(3, '0');
    return `SG-${yy}${mm}${dd}-${seq}`;
};

// Helper: parse date string to UTC midnight/end-of-day consistently
const toUTCStart = (dateStr) => new Date(dateStr + 'T00:00:00.000Z');
const toUTCEnd = (dateStr) => new Date(dateStr + 'T23:59:59.999Z');

// Helper: get current week Mon→Sat (payment Saturday)
const getCurrentWeekRange = () => {
    const now = new Date();
    const day = now.getDay(); // 0=Sun, 1=Mon...6=Sat
    const diffToMon = day === 0 ? 6 : day - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diffToMon);
    monday.setHours(0, 0, 0, 0);
    const saturday = new Date(monday);
    saturday.setDate(monday.getDate() + 5);
    saturday.setHours(23, 59, 59, 999);
    return { startDate: monday, endDate: saturday };
};

// GET /api/slipgaji — List all slips (admin)
router.get('/', auth, authorize('owner', 'director', 'supervisor', 'asset_admin'), async (req, res) => {
    try {
        const { workerId, startDate, endDate, status } = req.query;
        const query = {};
        if (workerId) query.workerId = workerId;
        if (startDate && endDate) {
            // Use UTC dates to avoid timezone mismatch
            query['period.startDate'] = { $gte: toUTCStart(startDate) };
            query['period.endDate'] = { $lte: toUTCEnd(endDate) };
        }
        if (status) query.status = status;

        const slips = await SlipGaji.find(query)
            .populate('workerId', 'fullName role paymentInfo')
            .populate('createdBy', 'fullName')
            .sort({ createdAt: -1 });

        res.json(slips);
    } catch (error) {
        console.error('Get slips error:', error);
        res.status(500).json({ msg: 'Server error' });
    }
});

// GET /api/slipgaji/workers — Get workers list for slip generation
router.get('/workers', auth, authorize('owner', 'director', 'supervisor', 'asset_admin'), async (req, res) => {
    try {
        const workers = await User.find({ role: 'worker', isVerified: true })
            .select('fullName role paymentInfo')
            .sort({ fullName: 1 });
        res.json(workers);
    } catch (error) {
        console.error('Get workers error:', error);
        res.status(500).json({ msg: 'Server error' });
    }
});

// GET /api/slipgaji/my — Get current user's own slips (worker-facing)
router.get('/my', auth, async (req, res) => {
    try {
        const slips = await SlipGaji.find({
            workerId: req.user._id,
            status: { $in: ['draft', 'authorized', 'issued'] },
        })
            .populate('workerId', 'fullName role paymentInfo')
            .populate('createdBy', 'fullName')
            .sort({ createdAt: -1 });

        res.json(slips);
    } catch (error) {
        console.error('Get my slips error:', error);
        res.status(500).json({ msg: 'Server error' });
    }
});

// GET /api/slipgaji/week — Get default week range helper
router.get('/week', auth, (req, res) => {
    const range = getCurrentWeekRange();
    res.json({
        startDate: range.startDate.toISOString(),
        endDate: range.endDate.toISOString(),
    });
});

// GET /api/slipgaji/:id — Get single slip
router.get('/:id', auth, authorize('owner', 'director', 'supervisor', 'asset_admin'), async (req, res) => {
    try {
        const slip = await SlipGaji.findById(req.params.id)
            .populate('workerId', 'fullName role paymentInfo email phone')
            .populate('createdBy', 'fullName');

        if (!slip) return res.status(404).json({ msg: 'Slip not found' });
        res.json(slip);
    } catch (error) {
        console.error('Get slip error:', error);
        res.status(500).json({ msg: 'Server error' });
    }
});

// POST /api/slipgaji/generate — Generate a draft slip from attendance data
router.post('/generate', auth, authorize('owner', 'director', 'supervisor', 'asset_admin'), async (req, res) => {
    try {
        const { workerId, startDate, endDate, bonus, deductions, notes } = req.body;

        if (!workerId || !startDate || !endDate) {
            return res.status(400).json({ msg: 'Worker, start date, and end date are required' });
        }

        // Use UTC dates consistently to avoid timezone issues
        const periodStart = toUTCStart(startDate);
        const periodEnd = toUTCEnd(endDate);

        if (periodStart >= periodEnd) {
            return res.status(400).json({ msg: 'Start date must be before end date' });
        }

        // Check if slip already exists for this worker and overlapping period
        const existing = await SlipGaji.findOne({
            workerId,
            'period.startDate': periodStart,
            'period.endDate': periodEnd,
        });
        if (existing) {
            return res.status(400).json({ msg: 'Slip already exists for this worker and date range' });
        }

        // Get worker info
        const worker = await User.findById(workerId);
        if (!worker) return res.status(404).json({ msg: 'Worker not found' });

        // Get attendance records for the date range
        const attendanceRecords = await Attendance.find({
            userId: workerId,
            date: { $gte: periodStart, $lte: periodEnd },
        });

        // Calculate attendance summary
        const totalDays = attendanceRecords.length;
        const presentDays = attendanceRecords.filter(a => a.status === 'Present').length;
        const lateDays = attendanceRecords.filter(a => a.status === 'Late').length;
        const absentDays = attendanceRecords.filter(a => a.status === 'Absent').length;
        const permitDays = attendanceRecords.filter(a => a.status === 'Permit').length;

        let totalHours = 0;
        attendanceRecords.forEach(a => {
            if (a.checkIn?.time && a.checkOut?.time) {
                totalHours += (new Date(a.checkOut.time) - new Date(a.checkIn.time)) / (1000 * 60 * 60);
            }
        });

        // Calculate earnings
        let totalDailyWage = 0;
        let totalOvertime = 0;
        let avgDailyRate = 0;

        attendanceRecords.forEach(a => {
            totalDailyWage += a.dailyRate || 0;
            totalOvertime += a.overtimePay || 0;
            if (a.dailyRate > 0) avgDailyRate = a.dailyRate;
        });

        // Calculate kasbon deductions for this date range
        const kasbonRecords = await Kasbon.find({
            userId: workerId,
            status: 'Approved',
            createdAt: { $gte: periodStart, $lte: periodEnd },
        });
        const kasbonDeduction = kasbonRecords.reduce((sum, k) => sum + (k.amount || 0), 0);

        const grossPay = totalDailyWage + totalOvertime + (bonus || 0);
        const totalDeductions = (deductions || 0) + kasbonDeduction;
        const netPay = grossPay - totalDeductions;

        const slipNumber = await generateSlipNumber(periodStart, periodEnd);

        const slip = new SlipGaji({
            slipNumber,
            workerId,
            period: { startDate: periodStart, endDate: periodEnd },
            attendanceSummary: { totalDays, presentDays, lateDays, absentDays, permitDays, totalHours: Math.round(totalHours * 10) / 10 },
            earnings: {
                dailyRate: avgDailyRate,
                totalDailyWage,
                totalOvertime,
                bonus: bonus || 0,
                deductions: deductions || 0,
                kasbonDeduction,
                netPay: Math.max(0, netPay),
            },
            workerPaymentInfo: {
                bankAccount: worker.paymentInfo?.bankAccount || '',
                bankPlatform: worker.paymentInfo?.bankPlatform || '',
                accountName: worker.paymentInfo?.accountName || '',
            },
            createdBy: req.user._id,
            notes: notes || '',
            status: 'draft',
        });

        await slip.save();

        const populated = await SlipGaji.findById(slip._id)
            .populate('workerId', 'fullName role paymentInfo email phone')
            .populate('createdBy', 'fullName');

        res.status(201).json(populated);
    } catch (error) {
        console.error('Generate slip error:', error);
        if (error.code === 11000) {
            return res.status(400).json({ msg: 'Slip already exists for this period' });
        }
        res.status(500).json({ msg: 'Server error' });
    }
});

// POST /api/slipgaji/:id/authorize — Authorize with passphrase
router.post('/:id/authorize', auth, authorize('owner', 'director'), async (req, res) => {
    try {
        const { passphrase } = req.body;
        if (!passphrase || passphrase.length < 4) {
            return res.status(400).json({ msg: 'Passphrase is required (min 4 characters)' });
        }

        const slip = await SlipGaji.findById(req.params.id);
        if (!slip) return res.status(404).json({ msg: 'Slip not found' });
        if (slip.status === 'issued') return res.status(400).json({ msg: 'Slip is already issued' });

        const hashedPassphrase = await bcrypt.hash(passphrase, 10);
        const role = req.user.role;

        if (role === 'director') {
            if (slip.authorization.directorPassphrase) {
                return res.status(400).json({ msg: 'Director has already signed this slip' });
            }
            slip.authorization.directorPassphrase = hashedPassphrase;
            slip.authorization.directorId = req.user._id;
            slip.authorization.directorName = req.user.fullName;
            slip.authorization.directorSignedAt = new Date();
        } else if (role === 'owner') {
            if (slip.authorization.ownerPassphrase) {
                return res.status(400).json({ msg: 'Owner has already signed this slip' });
            }
            slip.authorization.ownerPassphrase = hashedPassphrase;
            slip.authorization.ownerId = req.user._id;
            slip.authorization.ownerName = req.user.fullName;
            slip.authorization.ownerSignedAt = new Date();
        } else {
            return res.status(403).json({ msg: 'Only director or owner can authorize' });
        }

        // If both have signed, mark as authorized
        if (slip.authorization.directorPassphrase && slip.authorization.ownerPassphrase) {
            slip.status = 'authorized';
        }

        await slip.save();

        const populated = await SlipGaji.findById(slip._id)
            .populate('workerId', 'fullName role paymentInfo email phone')
            .populate('createdBy', 'fullName');

        res.json(populated);
    } catch (error) {
        console.error('Authorize slip error:', error);
        res.status(500).json({ msg: 'Server error' });
    }
});

// DELETE /api/slipgaji/:id — Delete a draft slip
router.delete('/:id', auth, authorize('owner', 'director', 'supervisor', 'asset_admin'), async (req, res) => {
    try {
        const slip = await SlipGaji.findById(req.params.id);
        if (!slip) return res.status(404).json({ msg: 'Slip not found' });
        if (slip.status !== 'draft') return res.status(400).json({ msg: 'Only draft slips can be deleted' });

        await SlipGaji.findByIdAndDelete(req.params.id);
        res.json({ msg: 'Slip deleted' });
    } catch (error) {
        console.error('Delete slip error:', error);
        res.status(500).json({ msg: 'Server error' });
    }
});

module.exports = router;
