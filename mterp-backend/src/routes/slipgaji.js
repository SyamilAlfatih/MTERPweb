const express = require('express');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { User, Attendance, Kasbon, SlipGaji, Project } = require('../models');
const { auth, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { notify } = require('../utils/notify');
const { wibDayRange, nowWIB, getProjectWeekRange } = require('../utils/date');
const { deduplicateAttendanceRecords, calculateStandardOvertime } = require('../utils/attendanceSSOT');
const { tagPreviousWeeksPaid } = require('../scripts/tagPreviousWeeksPaid');

const router = express.Router();

// Auto-cleanup: drop old monthly index and old workerId+period index without projectId
(async () => {
    try {
        const indexes = await SlipGaji.collection.indexes();
        const oldMonthly = indexes.find(idx =>
            idx.key && idx.key['period.month'] !== undefined && idx.key['period.year'] !== undefined
        );
        if (oldMonthly) {
            await SlipGaji.collection.dropIndex(oldMonthly.name);
            console.log('[SlipGaji] Dropped old monthly index:', oldMonthly.name);
        }

        const oldNoProject = indexes.find(idx =>
            idx.key && idx.key['workerId'] === 1 && idx.key['projectId'] === undefined && idx.key['period.startDate'] === 1
        );
        if (oldNoProject) {
            await SlipGaji.collection.dropIndex(oldNoProject.name);
            console.log('[SlipGaji] Dropped old slip index without projectId:', oldNoProject.name);
        }

        // Production settlement migration: tag all previous weeks prior to this week as paid
        await tagPreviousWeeksPaid({ autoClose: false });
    } catch (e) {
        // Ignore if collection doesn't exist yet
    }
})();

// Helper: generate slip number from dates (deletion-safe: uses max sequence, not count)
const generateSlipNumber = async (startDate) => {
    const s = new Date(startDate);
    const yy = s.getFullYear();
    const mm = String(s.getMonth() + 1).padStart(2, '0');
    const dd = String(s.getDate()).padStart(2, '0');

    // Find the highest sequence number already used this month
    const prefix = `SG-${yy}${mm}`;
    const existing = await SlipGaji.find(
        { slipNumber: { $regex: `^${prefix}` } },
        { slipNumber: 1 }
    ).lean();

    let maxSeq = 0;
    for (const doc of existing) {
        const parts = doc.slipNumber.split('-');
        const seq = parseInt(parts[2], 10);
        if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }

    const seq = String(maxSeq + 1).padStart(3, '0');
    return `SG-${yy}${mm}${dd}-${seq}`;
};

const PAYROLL_ADMIN_ROLES = [
    'owner', 'president_director', 'operational_director',
    'director', 'supervisor', 'site_manager', 'admin_project',
    'asset_admin'
];

/**
 * Helper to compute project-filtered earnings from attendance records.
 * - Deduplicates records by (worker, dateKey) to guarantee SSOT and prevent double-counting.
 * - Regular daily wage belongs if record.projectId == targetProjectId
 * - Overtime belongs if (record.overtimeProjectId || record.projectId) == targetProjectId
 * - Standard OT formula: hourlyRate = dailyRate / 8, overtimePay = hours * hourlyRate
 */
function computeProjectEarnings(attendanceRecords, targetProjectId) {
    const targetStr = targetProjectId ? targetProjectId.toString() : null;
    const deduplicated = deduplicateAttendanceRecords(attendanceRecords || []);

    let totalDays = 0;
    let presentDays = 0;
    let lateDays = 0;
    let absentDays = 0;
    let permitDays = 0;
    let totalHours = 0;
    let totalOvertimeHours = 0;
    let totalDailyWage = 0;
    let totalOvertime = 0;
    let dailyRate = 0;

    for (const a of deduplicated) {
        const regularProjStr = a.projectId?._id?.toString() || a.projectId?.toString() || null;
        const otProjStr = a.overtimeProjectId?._id?.toString() || a.overtimeProjectId?.toString() || regularProjStr;

        const isRegularMatch = (targetStr === null) ? !regularProjStr : (regularProjStr === targetStr);
        const isOtMatch = (targetStr === null) ? !otProjStr : (otProjStr === targetStr);

        // Process regular day wage (single count per unique day)
        if (isRegularMatch) {
            totalDays++;
            if (a.status === 'Present') presentDays++;
            else if (a.status === 'Late') lateDays++;
            else if (a.status === 'Absent') absentDays++;
            else if (a.status === 'Permit') permitDays++;

            if (a.checkIn?.time && a.checkOut?.time) {
                totalHours += (new Date(a.checkOut.time) - new Date(a.checkIn.time)) / (1000 * 60 * 60);
            }
            totalDailyWage += a.dailyRate || 0;
            if (a.dailyRate > 0) dailyRate = a.dailyRate;
        }

        // Process overtime
        if (isOtMatch && (a.overtimePay > 0 || a.overtimeHours > 0)) {
            let otHrs = a.overtimeHours || 0;
            const effectiveDaily = a.dailyRate > 0 ? a.dailyRate : dailyRate;
            const { hourlyRate, overtimePay: standardPay } = calculateStandardOvertime(effectiveDaily, otHrs);

            if (!otHrs && a.overtimePay > 0 && hourlyRate > 0) {
                otHrs = Math.round((a.overtimePay / hourlyRate) * 10) / 10;
            }

            const effectiveOtPay = a.overtimePay > 0 ? a.overtimePay : standardPay;
            totalOvertime += effectiveOtPay;
            totalOvertimeHours += otHrs;
        }

        // Always capture baseline daily rate from any record if not yet set
        if (dailyRate === 0) {
            if (a.dailyRate > 0) dailyRate = a.dailyRate;
            else if (a.hourlyRate > 0) dailyRate = a.hourlyRate * 8;
        }
    }

    return {
        attendanceSummary: {
            totalDays,
            presentDays,
            lateDays,
            absentDays,
            permitDays,
            totalHours: Math.round(totalHours * 10) / 10,
            totalOvertimeHours: Math.round(totalOvertimeHours * 10) / 10,
        },
        earnings: {
            dailyRate,
            totalDailyWage,
            totalOvertime,
        },
    };
}

// GET /api/slipgaji — List all slips (admin)
router.get('/', auth, authorize(...PAYROLL_ADMIN_ROLES), async (req, res) => {
    try {
        const { workerId, projectId, startDate, endDate, status } = req.query;
        const query = {};
        if (workerId) query.workerId = workerId;
        if (projectId) {
            if (projectId === 'unassigned' || projectId === 'null') {
                query.projectId = { $in: [null, undefined] };
            } else if (mongoose.Types.ObjectId.isValid(projectId)) {
                query.projectId = projectId;
            }
        }
        if (startDate && endDate) {
            const startRange = wibDayRange(startDate);
            const endRange = wibDayRange(endDate);
            if (!startRange || !endRange) return res.status(400).json({ msg: 'Invalid date format. Use YYYY-MM-DD.' });
            query['period.startDate'] = { $gte: startRange.start };
            query['period.endDate'] = { $lte: endRange.end };
        }
        if (status) query.status = status;

        const slips = await SlipGaji.find(query)
            .populate('workerId', 'fullName role position paymentInfo email phone')
            .populate('projectId', 'nama lokasi payrollConfig')
            .populate('paymentProof.uploadedBy', 'fullName role')
            .populate('paidBy', 'fullName role')
            .populate('createdBy', 'fullName')
            .sort({ createdAt: -1 });

        res.json(slips);
    } catch (error) {
        console.error('Get slips error:', error);
        res.status(500).json({ msg: 'Server error' });
    }
});

// GET /api/slipgaji/workers & /api/slipgaji/users — Get users list for slip generation
const getUsersForSlip = async (req, res) => {
    try {
        const filter = { isVerified: true };
        if (req.query.role) filter.role = req.query.role;
        const users = await User.find(filter)
            .select('fullName role position paymentInfo email phone')
            .sort({ fullName: 1 });
        res.json(users);
    } catch (error) {
        console.error('Get users for slip error:', error);
        res.status(500).json({ msg: 'Server error' });
    }
};

router.get('/workers', auth, authorize(...PAYROLL_ADMIN_ROLES), getUsersForSlip);
router.get('/users', auth, authorize(...PAYROLL_ADMIN_ROLES), getUsersForSlip);

// GET /api/slipgaji/my — Get current user's own slips (worker & staff facing)
router.get('/my', auth, async (req, res) => {
    try {
        const slips = await SlipGaji.find({
            workerId: req.user._id,
            status: { $in: ['draft', 'authorized', 'issued', 'paid'] },
        })
            .populate('workerId', 'fullName role position paymentInfo email phone')
            .populate('projectId', 'nama lokasi')
            .populate('paymentProof.uploadedBy', 'fullName role')
            .populate('paidBy', 'fullName role')
            .populate('createdBy', 'fullName')
            .sort({ createdAt: -1 });

        res.json(slips);
    } catch (error) {
        console.error('Get my slips error:', error);
        res.status(500).json({ msg: 'Server error' });
    }
});

// GET /api/slipgaji/week — Get project-aware week range helper
router.get('/week', auth, async (req, res) => {
    try {
        const { projectId } = req.query;
        let startDay = 1; // Default Monday
        let endDay = 6;   // Default Saturday

        if (projectId && projectId !== 'unassigned' && mongoose.Types.ObjectId.isValid(projectId)) {
            const project = await Project.findById(projectId).select('payrollConfig nama').lean();
            if (project?.payrollConfig?.cutoffStartDay !== undefined) {
                startDay = project.payrollConfig.cutoffStartDay;
            }
            if (project?.payrollConfig?.cutoffEndDay !== undefined) {
                endDay = project.payrollConfig.cutoffEndDay;
            }
        }

        const range = getProjectWeekRange(nowWIB(), startDay, endDay);
        res.json({
            startDate: range.startDate.toISOString(),
            endDate: range.endDate.toISOString(),
            startStr: range.startStr,
            endStr: range.endStr,
            startDay,
            endDay,
        });
    } catch (error) {
        console.error('Get week range error:', error);
        res.status(500).json({ msg: 'Server error' });
    }
});

// GET /api/slipgaji/worker-projects — Get summary of all projects a worker has attendance in during a period
router.get('/worker-projects', auth, authorize(...PAYROLL_ADMIN_ROLES), async (req, res) => {
    try {
        const { workerId, startDate, endDate } = req.query;
        if (!workerId || !startDate || !endDate) {
            return res.status(400).json({ msg: 'workerId, startDate, and endDate are required' });
        }

        const startRange = wibDayRange(startDate);
        const endRange = wibDayRange(endDate);
        if (!startRange || !endRange) return res.status(400).json({ msg: 'Invalid date format' });

        const records = await Attendance.find({
            userId: workerId,
            date: { $gte: startRange.start, $lte: endRange.end },
        })
            .populate('projectId', 'nama lokasi payrollConfig')
            .populate('overtimeProjectId', 'nama lokasi payrollConfig')
            .lean();

        const deduplicatedRecords = deduplicateAttendanceRecords(records);

        const projectMap = new Map();

        const getOrCreate = (pId, pDoc) => {
            const key = pId ? pId.toString() : 'unassigned';
            if (!projectMap.has(key)) {
                projectMap.set(key, {
                    projectId: pId || null,
                    projectName: pDoc?.nama || 'Kantor / Non-Proyek',
                    projectLocation: pDoc?.lokasi || '',
                    payrollConfig: pDoc?.payrollConfig || null,
                    daysCount: 0,
                    dailyWage: 0,
                    overtimeHours: 0,
                    overtimePay: 0,
                    totalPay: 0,
                });
            }
            return projectMap.get(key);
        };

        for (const a of deduplicatedRecords) {
            const regProj = a.projectId;
            const regId = regProj?._id || (mongoose.Types.ObjectId.isValid(regProj) ? regProj : null);
            const regEntry = getOrCreate(regId, regProj);
            if (['Present', 'Late', 'Half-day'].includes(a.status) || (a.dailyRate || 0) > 0) {
                regEntry.daysCount++;
                regEntry.dailyWage += a.dailyRate || 0;
            }

            if ((a.overtimePay || 0) > 0) {
                const otProj = a.overtimeProjectId || a.projectId;
                const otId = otProj?._id || (mongoose.Types.ObjectId.isValid(otProj) ? otProj : null);
                const otEntry = getOrCreate(otId, otProj);
                otEntry.overtimePay += a.overtimePay || 0;
                let otHours = a.overtimeHours || 0;
                if (!otHours && a.hourlyRate > 0) otHours = a.overtimePay / a.hourlyRate;
                else if (!otHours && a.dailyRate > 0) otHours = a.overtimePay / Math.round(a.dailyRate / 8);
                otEntry.overtimeHours += otHours;
            }
        }

        const projectList = Array.from(projectMap.values()).map(p => ({
            ...p,
            overtimeHours: Math.round(p.overtimeHours * 10) / 10,
            totalPay: p.dailyWage + p.overtimePay,
        }));

        res.json(projectList);
    } catch (error) {
        console.error('Get worker projects error:', error);
        res.status(500).json({ msg: 'Server error' });
    }
});

// GET /api/slipgaji/preview — Preview slip data without saving (project-tied)
router.get('/preview', auth, authorize(...PAYROLL_ADMIN_ROLES), async (req, res) => {
    try {
        const { workerId, projectId, startDate, endDate } = req.query;
        if (!workerId || !startDate || !endDate) {
            return res.status(400).json({ msg: 'workerId, startDate, and endDate are required' });
        }

        const startRange = wibDayRange(startDate);
        const endRange = wibDayRange(endDate);
        if (!startRange || !endRange) {
            return res.status(400).json({ msg: 'Invalid date format. Use YYYY-MM-DD.' });
        }
        const periodStart = startRange.start;
        const periodEnd = endRange.end;

        let targetProjectId = null;
        let projectName = 'Kantor / Non-Proyek';
        let projectLocation = '';
        if (projectId && projectId !== 'unassigned' && projectId !== 'null' && mongoose.Types.ObjectId.isValid(projectId)) {
            const proj = await Project.findById(projectId).select('nama lokasi').lean();
            if (proj) {
                targetProjectId = proj._id;
                projectName = proj.nama;
                projectLocation = proj.lokasi;
            }
        }

        // Attendance query with project population
        const attendanceRecords = await Attendance.find({
            userId: workerId,
            date: { $gte: periodStart, $lte: periodEnd },
        })
            .populate('projectId', 'nama lokasi')
            .populate('overtimeProjectId', 'nama lokasi')
            .lean();

        const computed = computeProjectEarnings(attendanceRecords, targetProjectId);

        // Kasbon records for this date range
        const kasbonRecords = await Kasbon.find({
            userId: workerId,
            status: 'Approved',
            createdAt: { $gte: periodStart, $lte: periodEnd },
        }).lean();

        res.json({
            project: {
                projectId: targetProjectId,
                projectName,
                projectLocation,
            },
            attendanceSummary: computed.attendanceSummary,
            earnings: computed.earnings,
            kasbons: kasbonRecords.map(k => ({
                _id: k._id,
                amount: k.amount,
                reason: k.reason,
                createdAt: k.createdAt,
            })),
        });
    } catch (error) {
        console.error('Preview slip error:', error);
        res.status(500).json({ msg: 'Server error' });
    }
});

// GET /api/slipgaji/:id — Get single slip
router.get('/:id', auth, authorize(...PAYROLL_ADMIN_ROLES), async (req, res) => {
    try {
        const slip = await SlipGaji.findById(req.params.id)
            .populate('workerId', 'fullName role position paymentInfo email phone')
            .populate('projectId', 'nama lokasi payrollConfig')
            .populate('paymentProof.uploadedBy', 'fullName role')
            .populate('paidBy', 'fullName role')
            .populate('createdBy', 'fullName');

        if (!slip) return res.status(404).json({ msg: 'Slip not found' });
        res.json(slip);
    } catch (error) {
        console.error('Get slip error:', error);
        res.status(500).json({ msg: 'Server error' });
    }
});

// POST /api/slipgaji/generate — Generate a draft slip from attendance data tied to a project
router.post('/generate', auth, authorize(...PAYROLL_ADMIN_ROLES), async (req, res) => {
    try {
        const { workerId, projectId, startDate, endDate, bonus, deductions, kasbonDeduction: customKasbon, notes } = req.body;

        if (!workerId || !startDate || !endDate) {
            return res.status(400).json({ msg: 'Worker/User, start date, and end date are required' });
        }

        const startRange = wibDayRange(startDate);
        const endRange = wibDayRange(endDate);
        if (!startRange || !endRange) {
            return res.status(400).json({ msg: 'Invalid date format. Use YYYY-MM-DD.' });
        }
        const periodStart = startRange.start;
        const periodEnd = endRange.end;

        if (periodStart >= periodEnd) {
            return res.status(400).json({ msg: 'Start date must be before end date' });
        }

        let targetProjectId = null;
        let projectName = 'Kantor / Non-Proyek';
        let projectLocation = '';
        if (projectId && projectId !== 'unassigned' && projectId !== 'null' && mongoose.Types.ObjectId.isValid(projectId)) {
            const proj = await Project.findById(projectId).select('nama lokasi').lean();
            if (proj) {
                targetProjectId = proj._id;
                projectName = proj.nama;
                projectLocation = proj.lokasi;
            }
        }

        // Check if slip already exists for this worker + project + period
        const existingQuery = {
            workerId,
            'period.startDate': periodStart,
            'period.endDate': periodEnd,
        };
        if (targetProjectId) {
            existingQuery.projectId = targetProjectId;
        } else {
            existingQuery.projectId = { $in: [null, undefined] };
        }

        const existing = await SlipGaji.findOne(existingQuery);
        if (existing) {
            const populated = await SlipGaji.findById(existing._id)
                .populate('workerId', 'fullName role position paymentInfo email phone')
                .populate('projectId', 'nama lokasi payrollConfig')
                .populate('createdBy', 'fullName');
            return res.status(200).json(populated);
        }

        // Get worker info
        const worker = await User.findById(workerId);
        if (!worker) return res.status(404).json({ msg: 'User not found' });

        // Get attendance records for the date range
        const attendanceRecords = await Attendance.find({
            userId: workerId,
            date: { $gte: periodStart, $lte: periodEnd },
        })
            .populate('projectId', 'nama lokasi')
            .populate('overtimeProjectId', 'nama lokasi')
            .lean();

        const computed = computeProjectEarnings(attendanceRecords, targetProjectId);

        // Kasbon deductions
        let kasbonDeduction = 0;
        if (customKasbon !== undefined) {
            kasbonDeduction = Number(customKasbon) || 0;
        } else {
            const kasbonRecords = await Kasbon.find({
                userId: workerId,
                status: 'Approved',
                createdAt: { $gte: periodStart, $lte: periodEnd },
            });
            kasbonDeduction = kasbonRecords.reduce((sum, k) => sum + (k.amount || 0), 0);
        }

        const grossPay = computed.earnings.totalDailyWage + computed.earnings.totalOvertime + (bonus || 0);
        const totalDeductions = (deductions || 0) + kasbonDeduction;
        const netPay = grossPay - totalDeductions;

        const slipNumber = await generateSlipNumber(periodStart);

        const slip = new SlipGaji({
            slipNumber,
            workerId,
            projectId: targetProjectId || undefined,
            projectName,
            projectLocation,
            period: { startDate: periodStart, endDate: periodEnd },
            attendanceSummary: computed.attendanceSummary,
            earnings: {
                dailyRate: computed.earnings.dailyRate,
                totalDailyWage: computed.earnings.totalDailyWage,
                totalOvertime: computed.earnings.totalOvertime,
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
            .populate('workerId', 'fullName role position paymentInfo email phone')
            .populate('projectId', 'nama lokasi payrollConfig')
            .populate('createdBy', 'fullName');

        res.status(201).json(populated);
    } catch (error) {
        console.error('Generate slip error:', error);
        if (error.code === 11000) {
            try {
                const { workerId, projectId, startDate, endDate } = req.body;
                const startR = wibDayRange(startDate);
                const endR = wibDayRange(endDate);
                if (!startR || !endR) return res.status(400).json({ msg: 'Invalid dates' });
                const periodStart = startR.start;
                const periodEnd = endR.end;

                const q = { workerId, 'period.startDate': periodStart, 'period.endDate': periodEnd };
                if (projectId && mongoose.Types.ObjectId.isValid(projectId)) {
                    q.projectId = projectId;
                } else {
                    q.projectId = { $in: [null, undefined] };
                }

                const existing = await SlipGaji.findOne(q)
                    .populate('workerId', 'fullName role position paymentInfo email phone')
                    .populate('projectId', 'nama lokasi payrollConfig')
                    .populate('createdBy', 'fullName');
                if (existing) return res.status(200).json(existing);
            } catch (_) { /* fall through */ }
            return res.status(400).json({ msg: 'Slip already exists for this worker and project in this period' });
        }
        res.status(500).json({ msg: 'Server error' });
    }
});

// POST /api/slipgaji/:id/authorize — Authorize with passphrase
router.post('/:id/authorize', auth, authorize('owner', 'director', 'president_director', 'operational_director'), async (req, res) => {
    try {
        const { passphrase } = req.body;
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

        const slip = await SlipGaji.findById(req.params.id);
        if (!slip) return res.status(404).json({ msg: 'Slip not found' });
        if (slip.status === 'issued') return res.status(400).json({ msg: 'Slip is already issued' });

        const hashedPassphrase = await bcrypt.hash(passphrase, 10);
        const role = req.user.role;

        if (['director', 'president_director', 'operational_director'].includes(role)) {
            if (slip.authorization.directorPassphrase) {
                return res.status(400).json({ msg: 'Director has already signed this slip' });
            }
            slip.authorization.directorPassphrase = hashedPassphrase;
            slip.authorization.directorId = req.user._id;
            slip.authorization.directorName = req.user.fullName;
            slip.authorization.directorSignedAt = nowWIB();
        } else if (role === 'owner') {
            if (slip.authorization.ownerPassphrase) {
                return res.status(400).json({ msg: 'Owner has already signed this slip' });
            }
            slip.authorization.ownerPassphrase = hashedPassphrase;
            slip.authorization.ownerId = req.user._id;
            slip.authorization.ownerName = req.user.fullName;
            slip.authorization.ownerSignedAt = nowWIB();
        } else {
            return res.status(403).json({ msg: 'Only director or owner can authorize' });
        }

        // If both have signed, mark as authorized
        if (slip.authorization.directorPassphrase && slip.authorization.ownerPassphrase) {
            slip.status = 'authorized';
        }

        await slip.save();

        const populated = await SlipGaji.findById(slip._id)
            .populate('workerId', 'fullName role position paymentInfo email phone')
            .populate('projectId', 'nama lokasi payrollConfig')
            .populate('paymentProof.uploadedBy', 'fullName role')
            .populate('paidBy', 'fullName role')
            .populate('createdBy', 'fullName');

        res.json(populated);
    } catch (error) {
        console.error('Authorize slip error:', error);
        res.status(500).json({ msg: 'Server error' });
    }
});

// POST /api/slipgaji/:id/finalize-payment — Finalize payment with transfer proof & mark SSOT paid
router.post('/:id/finalize-payment', auth, authorize(...PAYROLL_ADMIN_ROLES), upload.single('paymentProof'), async (req, res) => {
    try {
        const slip = await SlipGaji.findById(req.params.id);
        if (!slip) return res.status(404).json({ msg: 'Slip gaji tidak ditemukan' });
        if (slip.status === 'paid') return res.status(400).json({ msg: 'Slip gaji sudah berstatus LUNAS (paid)' });
        if (!['authorized', 'issued'].includes(slip.status)) {
            return res.status(400).json({ msg: 'Hanya slip gaji yang sudah diotorisasi yang dapat difinalisasi pembayarannya' });
        }

        if (!req.file) {
            return res.status(400).json({ msg: 'Bukti transfer pembayaran (screenshot transfer) wajib diunggah' });
        }

        const fileUrl = `/uploads/documents/${req.file.filename}`;
        const paymentTime = nowWIB();

        slip.status = 'paid';
        slip.paidAt = paymentTime;
        slip.paidBy = req.user._id;
        slip.paymentProof = {
            fileUrl,
            fileName: req.file.originalname,
            uploadedAt: paymentTime,
            uploadedBy: req.user._id,
            notes: (req.body.notes || req.body.paymentNotes || '').trim(),
            amountPaid: slip.earnings?.netPay || 0,
            paymentDate: req.body.paymentDate ? new Date(req.body.paymentDate) : paymentTime,
        };

        await slip.save();

        // === SINGLE SOURCE OF TRUTH (SSOT) SYNCHRONIZATION ===
        // 1. Mark corresponding Attendance records as 'Paid'
        const startRange = wibDayRange(slip.period.startDate);
        const endRange = wibDayRange(slip.period.endDate);
        const dateStart = startRange ? startRange.start : new Date(slip.period.startDate);
        const dateEnd = endRange ? endRange.end : new Date(new Date(slip.period.endDate).setHours(23, 59, 59, 999));

        const attendanceFilter = {
            userId: slip.workerId,
            date: { $gte: dateStart, $lte: dateEnd },
        };
        if (slip.projectId) {
            attendanceFilter.$or = [
                { projectId: slip.projectId },
                { overtimeProjectId: slip.projectId },
            ];
        } else {
            attendanceFilter.projectId = { $in: [null, undefined] };
        }

        await Attendance.updateMany(
            attendanceFilter,
            {
                $set: {
                    paymentStatus: 'Paid',
                    paidAt: paymentTime,
                },
            }
        );

        // 2. Mark deducted Kasbon records as 'Paid' if any kasbon was deducted
        if (slip.earnings?.kasbonDeduction > 0) {
            await Kasbon.updateMany(
                {
                    userId: slip.workerId,
                    status: 'Approved',
                    createdAt: { $gte: slip.period.startDate, $lte: slip.period.endDate },
                },
                {
                    $set: {
                        status: 'Paid',
                        paidAt: paymentTime,
                    },
                }
            );
        }

        // 3. Fire-and-forget notification to worker
        try {
            notify({
                recipient: slip.workerId,
                type: 'payroll',
                title: 'Slip Gaji Lunas (Transfer Berhasil)',
                message: `Gaji Anda sebesar Rp ${(slip.earnings?.netPay || 0).toLocaleString('id-ID')} telah ditransfer dan bukti transfer telah diunggah.`,
                data: { slipId: slip._id },
            }).catch(err => console.warn('[Notify Payroll Error]:', err.message));
        } catch (notifErr) {
            console.warn('[Notify Payroll Error]:', notifErr.message);
        }

        const populated = await SlipGaji.findById(slip._id)
            .populate('workerId', 'fullName role position paymentInfo email phone')
            .populate('projectId', 'nama lokasi payrollConfig')
            .populate('paymentProof.uploadedBy', 'fullName role')
            .populate('paidBy', 'fullName role')
            .populate('createdBy', 'fullName');

        res.json(populated);
    } catch (error) {
        console.error('Finalize slip payment error:', error);
        res.status(500).json({ msg: 'Gagal memfinalisasi pembayaran slip gaji', error: error.message });
    }
});

// DELETE /api/slipgaji/:id — Delete a draft slip
router.delete('/:id', auth, authorize(...PAYROLL_ADMIN_ROLES), async (req, res) => {
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

// POST /api/slipgaji/admin/tag-previous-weeks-paid — Manually trigger previous weeks settlement
router.post('/admin/tag-previous-weeks-paid', auth, authorize('owner', 'director', 'operational_director'), async (req, res) => {
    try {
        const result = await tagPreviousWeeksPaid({ autoClose: false });
        res.json({ msg: 'Berhasil menandai slip & upah minggu sebelumnya sebagai Lunas', result });
    } catch (error) {
        console.error('Tag previous weeks paid error:', error);
        res.status(500).json({ msg: 'Gagal memperbarui status minggu sebelumnya', error: error.message });
    }
});

module.exports = router;
