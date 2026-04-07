const express = require('express');
const { Project, Task, Attendance, Request, User, Supply, DailyReport } = require('../models');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

// Timezone-safe helper (matches attendance.js)
const TZ_OFFSET_HOURS = parseInt(process.env.TZ_OFFSET_HOURS || '7', 10);

function getTodayRange() {
  const now = new Date();
  const localMs = now.getTime() + (TZ_OFFSET_HOURS * 60 * 60 * 1000);
  const localDay = new Date(localMs);
  localDay.setUTCHours(0, 0, 0, 0);
  const todayStart = new Date(localDay.getTime() - (TZ_OFFSET_HOURS * 60 * 60 * 1000));
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { todayStart, todayEnd };
}

// GET /api/dashboard?projectId=<optional>
router.get('/', auth, authorize('owner', 'director', 'supervisor', 'asset_admin'), async (req, res) => {
    try {
        const { projectId } = req.query;
        const { todayStart, todayEnd } = getTodayRange();
        
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - 6);
        weekStart.setHours(0, 0, 0, 0);
        
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);

        const taskQuery = projectId ? { projectId } : {};
        const attendanceQuery = { date: { $gte: todayStart, $lte: todayEnd } };
        if (projectId) attendanceQuery.projectId = projectId;
        const weeklyAttendanceQuery = { date: { $gte: weekStart, $lte: todayEnd } };
        if (projectId) weeklyAttendanceQuery.projectId = projectId;
        const wageQuery = { date: { $gte: monthStart, $lte: todayEnd } };
        if (projectId) wageQuery.projectId = projectId;
        const unpaidQuery = { paymentStatus: 'Unpaid' };
        if (projectId) unpaidQuery.projectId = projectId;
        const reqQuery = { status: 'Pending' };
        if (projectId) reqQuery.projectId = projectId;

        const [
            allProjects,
            tasks,
            attendanceToday,
            weeklyRecords,
            monthlyWageRecords,
            totalWorkers,
            unpaidRecords,
            pendingRequests
        ] = await Promise.all([
            Project.find().select('_id nama status progress totalBudget workItems startDate endDate').sort({ createdAt: -1 }).lean(),
            Task.find(taskQuery).select('status priority').lean(),
            Attendance.find(attendanceQuery).populate('userId', 'fullName role').populate('projectId', 'nama').select('status checkIn checkOut userId projectId dailyRate overtimePay wageType paymentStatus').lean(),
            Attendance.find(weeklyAttendanceQuery).select('date status dailyRate overtimePay paymentStatus').lean(),
            Attendance.find(wageQuery).select('dailyRate overtimePay paymentStatus').lean(),
            User.countDocuments({ isVerified: true }),
            Attendance.find(unpaidQuery).select('dailyRate overtimePay').lean(),
            Request.countDocuments(reqQuery)
        ]);

        const projectList = allProjects.map(p => ({ _id: p._id, nama: p.nama }));
        const projects = projectId ? allProjects.filter(p => p._id.toString() === projectId) : allProjects;
        const projectIds = projects.map(p => p._id);

        const [allSupplies, reports] = await Promise.all([
            Supply.find({ projectId: { $in: projectIds } }).select('actualCost').lean(),
            projectId && projects.length === 1 
                ? DailyReport.find({ projectId }).sort({ date: 1 }).select('date progressPercent').limit(30).lean()
                : DailyReport.find({ projectId: { $in: projectIds } }).sort({ date: 1 }).select('date progressPercent').lean()
        ]);

        // Status breakdown
        const statusCounts = { Planning: 0, 'In Progress': 0, Completed: 0, 'On Hold': 0 };
        projects.forEach(p => { statusCounts[p.status] = (statusCounts[p.status] || 0) + 1; });

        // Budget calculation
        let totalBudget = 0;
        let actualSpend = 0;
        projects.forEach(p => {
            totalBudget += p.totalBudget || 0;
            (p.workItems || []).forEach(w => { actualSpend += w.actualCost || 0; });
        });
        allSupplies.forEach(s => { actualSpend += s.actualCost || 0; });

        // Average progress
        const avgProgress = projects.length
            ? Math.round(projects.reduce((s, p) => s + (p.progress || 0), 0) / projects.length)
            : 0;

        const taskStatusCounts = { pending: 0, in_progress: 0, completed: 0, cancelled: 0 };
        tasks.forEach(t => { taskStatusCounts[t.status] = (taskStatusCounts[t.status] || 0) + 1; });

        const attendanceCounts = { Present: 0, Absent: 0, Late: 0, 'Half-day': 0, Permit: 0 };
        attendanceToday.forEach(a => { attendanceCounts[a.status] = (attendanceCounts[a.status] || 0) + 1; });

        // Today's worker breakdown
        const todayWorkers = attendanceToday.map(a => ({
            _id: a._id,
            name: a.userId?.fullName || 'Unknown',
            role: a.userId?.role || 'worker',
            status: a.status,
            checkIn: a.checkIn?.time || null,
            checkOut: a.checkOut?.time || null,
            project: a.projectId?.nama || '-',
            dailyRate: a.dailyRate || 0,
            overtimePay: a.overtimePay || 0,
            wageType: a.wageType || 'daily',
            paymentStatus: a.paymentStatus || 'Unpaid',
        }));

        // Weekly attendance trend
        const weeklyTrend = [];
        for (let i = 6; i >= 0; i--) {
            const day = new Date();
            day.setDate(day.getDate() - i);
            day.setHours(0, 0, 0, 0);
            const dayEnd = new Date(day);
            dayEnd.setHours(23, 59, 59, 999);

            const dayRecords = weeklyRecords.filter(r => {
                const d = new Date(r.date);
                return d >= day && d <= dayEnd;
            });

            weeklyTrend.push({
                date: day.toISOString().split('T')[0],
                dayLabel: day.toLocaleDateString('en-US', { weekday: 'short' }),
                present: dayRecords.filter(r => r.status === 'Present').length,
                late: dayRecords.filter(r => r.status === 'Late').length,
                absent: dayRecords.filter(r => r.status === 'Absent').length,
                permit: dayRecords.filter(r => r.status === 'Permit').length,
                total: dayRecords.length,
            });
        }

        // Wage summary
        const wageSummary = {
            totalWages: 0,
            totalPaid: 0,
            totalUnpaid: 0,
            totalOvertime: 0,
            recordsPaid: 0,
            recordsUnpaid: 0,
        };

        monthlyWageRecords.forEach(r => {
            const wage = (r.dailyRate || 0) + (r.overtimePay || 0);
            wageSummary.totalWages += wage;
            wageSummary.totalOvertime += r.overtimePay || 0;
            if (r.paymentStatus === 'Paid') {
                wageSummary.totalPaid += wage;
                wageSummary.recordsPaid++;
            } else {
                wageSummary.totalUnpaid += wage;
                wageSummary.recordsUnpaid++;
            }
        });

        const totalUnpaid = unpaidRecords.reduce((s, r) => s + (r.dailyRate || 0) + (r.overtimePay || 0), 0);

        // Progress timeline
        let progressTimeline = [];
        const reportsData = reports || [];
        if (projectId && projects.length === 1) {
            progressTimeline = reportsData.map(r => ({
                date: r.date,
                progress: r.progressPercent || 0,
            }));
        } else {
            const dateMap = {};
            reportsData.forEach(r => {
                const key = new Date(r.date).toISOString().split('T')[0];
                if (!dateMap[key]) dateMap[key] = { total: 0, count: 0 };
                dateMap[key].total += r.progressPercent || 0;
                dateMap[key].count += 1;
            });
            progressTimeline = Object.keys(dateMap)
                .sort()
                .slice(-30)
                .map(date => ({
                    date,
                    progress: Math.round(dateMap[date].total / dateMap[date].count),
                }));
        }

        res.json({
            projectList,
            totalProjects: projects.length,
            statusCounts,
            totalBudget,
            actualSpend,
            avgProgress,
            taskStatusCounts,
            totalTasks: tasks.length,
            attendanceCounts,
            totalAttendanceToday: attendanceToday.length,
            totalUnpaid,
            pendingRequests,
            progressTimeline,
            // Enhanced attendance
            todayWorkers,
            weeklyTrend,
            wageSummary,
            totalWorkers,
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ msg: 'Server error' });
    }
});

module.exports = router;
