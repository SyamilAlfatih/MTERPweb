const express = require('express');
const { Project, Attendance, DailyReport } = require('../models');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Timezone-safe helper
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

// GET /api/updates - Get site updates/activity feed
router.get('/', auth, async (req, res) => {
  try {
    const updates = [];
    const { todayStart, todayEnd } = getTodayRange();
    
    // Last 7 days
    const weekAgo = new Date(todayStart);
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    // 1. Get recently created projects (last 7 days)
    const recentProjects = await Project.find({
      createdAt: { $gte: weekAgo }
    })
      .sort({ createdAt: -1 })
      .limit(3)
      .select('nama lokasi createdAt status');
    
    recentProjects.forEach(project => {
      updates.push({
        _id: `project-${project._id}`,
        type: 'project',
        icon: 'HardHat',
        title: 'New Project',
        description: project.nama,
        subtitle: project.lokasi,
        timestamp: project.createdAt,
        color: '#D97706',
        bg: '#FEF3C7',
      });
    });
    
    // 2. Get today's attendance summary
    const todayAttendance = await Attendance.find({
      date: { $gte: todayStart, $lte: todayEnd }
    }).populate('userId', 'fullName');
    
    if (todayAttendance.length > 0) {
      let totalHours = 0;
      let completedCount = 0;
      
      todayAttendance.forEach(a => {
        if (a.checkIn?.time && a.checkOut?.time) {
          const hours = (new Date(a.checkOut.time) - new Date(a.checkIn.time)) / (1000 * 60 * 60);
          totalHours += hours;
          completedCount++;
        }
      });
      
      updates.push({
        _id: 'attendance-today',
        type: 'attendance',
        icon: 'Clock',
        title: 'Today\'s Attendance',
        description: `${todayAttendance.length} checked in`,
        subtitle: completedCount > 0 ? `${totalHours.toFixed(1)} total man-hours` : 'In progress',
        timestamp: new Date(),
        color: '#10B981',
        bg: '#D1FAE5',
      });
    }
    
    // 3. Get recent daily reports (from DailyReport collection)
    const recentReports = await DailyReport.find({
      date: { $gte: weekAgo }
    })
      .sort({ date: -1 })
      .limit(5)
      .populate('projectId', 'nama');
    
    recentReports.forEach(report => {
      if (report.projectId) {
        updates.push({
          _id: `report-${report._id}`,
          type: 'report',
          icon: 'FileText',
          title: 'Daily Report',
          description: report.projectId.nama,
          subtitle: `${report.progressPercent || 0}% progress`,
          timestamp: report.date,
          color: '#3B82F6',
          bg: '#DBEAFE',
        });
      }
    });
    
    // Sort all updates by timestamp (newest first)
    updates.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Limit to latest 10
    const limitedUpdates = updates.slice(0, 10);
    
    res.json(limitedUpdates);
  } catch (error) {
    console.error('Get updates error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
