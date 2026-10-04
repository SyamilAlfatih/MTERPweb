const express = require('express');
const { Attendance, User, Project, AttendanceSession } = require('../models');
const { auth, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimiter');
const { wibDayRange, nowWIB } = require('../utils/date');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

const router = express.Router();

// ─── Helpers ────────────────────────────────────────────────────────────────

const SUPERVISOR_ROLES = [
  'owner', 'president_director', 'operational_director',
  'director', 'supervisor', 'site_manager', 'admin_project',
  'asset_admin', 'foreman',
];

function getTodayStart(dateInput) {
  const range = wibDayRange(dateInput || nowWIB());
  return range ? range.start : new Date();
}

// ─── POST /api/attendance-session ───────────────────────────────────────────
// Create a new group attendance session
router.post(
  '/',
  auth,
  authorize(...SUPERVISOR_ROLES),
  uploadLimiter,
  upload.single('groupPhoto'),
  async (req, res) => {
    try {
      const { projectId, workerIds, notes, clientTime } = req.body;

      // 1. Validate inputs
      if (!projectId) {
        return res.status(400).json({ msg: 'projectId is required' });
      }
      if (!req.file) {
        return res.status(400).json({ msg: 'Group photo is required' });
      }

      // Parse workerIds — could be JSON string or array
      let parsedWorkerIds = [];
      if (typeof workerIds === 'string') {
        try {
          parsedWorkerIds = JSON.parse(workerIds);
        } catch {
          return res.status(400).json({ msg: 'workerIds must be a valid JSON array' });
        }
      } else if (Array.isArray(workerIds)) {
        parsedWorkerIds = workerIds;
      }

      // Resolve any offline worker IDs to valid MongoDB ObjectIds
      const resolvedWorkerIds = [];
      for (const wid of parsedWorkerIds) {
        if (mongoose.Types.ObjectId.isValid(wid)) {
          resolvedWorkerIds.push(wid);
        } else {
          const user = await User.findOne({
            $or: [{ fullName: String(wid) }, { username: String(wid) }]
          }).select('_id').lean();
          if (user) {
            resolvedWorkerIds.push(user._id);
          }
        }
      }
      if (resolvedWorkerIds.length > 0) {
        parsedWorkerIds = resolvedWorkerIds;
      }

      if (!parsedWorkerIds.length) {
        return res.status(400).json({ msg: 'At least one worker must be selected' });
      }

      // 2. Validate project exists
      const project = await Project.findById(projectId).select('_id nama').lean();
      if (!project) {
        return res.status(404).json({ msg: 'Project not found' });
      }

      // 3. Compress image server-side with sharp
      const compressedFilename = `session-${Date.now()}-compressed.jpg`;
      const compressedDir = path.join(__dirname, '../../uploads/attendance-sessions');
      if (!fs.existsSync(compressedDir)) {
        fs.mkdirSync(compressedDir, { recursive: true });
      }
      const compressedPath = path.join(compressedDir, compressedFilename);

      await sharp(req.file.path)
        .resize({ width: 1920, withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toFile(compressedPath);

      // Delete the original uncompressed file
      fs.unlink(req.file.path, () => {});

      const photoUrl = `uploads/attendance-sessions/${compressedFilename}`;

      // 4. Get record timestamp & today's date (WIB midnight)
      let recordTime = nowWIB();
      if (clientTime) {
        const parsed = new Date(clientTime);
        if (!isNaN(parsed.getTime())) {
          recordTime = parsed;
        }
      }
      const today = getTodayStart(recordTime);

      // 5. Create the AttendanceSession document
      const session = await AttendanceSession.create({
        supervisorId: req.user._id,
        projectId,
        date: today,
        photoUrl,
        workerIds: parsedWorkerIds,
        notes: notes || '',
        createdAt: recordTime,
      });

      // 6. Bulk-upsert individual Attendance records
      const conflicts = [];
      const created = [];

      for (const workerId of parsedWorkerIds) {
        // Check if worker already has attendance for today
        const existing = await Attendance.findOne({
          userId: workerId,
          date: today,
        }).lean();

        if (existing && existing.checkIn?.time) {
          // Worker already checked in individually — skip, record conflict
          const user = await User.findById(workerId).select('fullName').lean();
          conflicts.push({
            workerId,
            fullName: user?.fullName || 'Unknown',
            reason: 'Already checked in individually',
          });
          continue;
        }

        if (existing) {
          // Record exists but no check-in (e.g., permit) — update it
          await Attendance.updateOne(
            { _id: existing._id },
            {
              $set: {
                checkIn: {
                  time: existing.checkIn?.time || recordTime,
                  photo: existing.checkIn?.photo || photoUrl,
                },
                status: 'Present',
                projectId,
                sessionId: session._id,
              },
            }
          );
        } else {
          // Create new attendance record with group photo as proof
          await Attendance.create({
            userId: workerId,
            date: today,
            checkIn: {
              time: recordTime,
              photo: photoUrl,
            },
            status: 'Present',
            projectId,
            sessionId: session._id,
            wageType: 'daily',
            wageMultiplier: 1,
          });
        }
        created.push(workerId);
      }

      res.status(201).json({
        msg: `${created.length} workers marked present`,
        session,
        created: created.length,
        conflicts,
      });
    } catch (error) {
      console.error('Create attendance session error:', error);
      res.status(500).json({ msg: 'Server error' });
    }
  }
);

/**
 * Helper to compute effective session status:
 * If explicitly closed, returns 'closed'.
 * If all workers (from workerIds and lateWorkerIds) have a corresponding record in leaveRecords, returns 'closed'.
 * Otherwise returns 'active'.
 */
function computeSessionStatus(session) {
  if (session.status === 'closed') return 'closed';
  const allWorkerIds = [
    ...(session.workerIds || []).map(id => (id?._id || id).toString()),
    ...(session.lateWorkerIds || []).map(lw => (lw.workerId?._id || lw.workerId).toString()),
  ];
  const leftWorkerIds = (session.leaveRecords || []).map(lr => (lr.workerId?._id || lr.workerId).toString());
  if (allWorkerIds.length > 0 && allWorkerIds.every(id => leftWorkerIds.includes(id))) {
    return 'closed';
  }
  return session.status || 'active';
}

// ─── GET /api/attendance-session/unclosed ───────────────────────────────────
// List previous unclosed sessions (date < today and not fully closed)
router.get(
  '/unclosed',
  auth,
  authorize(...SUPERVISOR_ROLES),
  async (req, res) => {
    try {
      const todayStart = getTodayStart();
      const query = {
        date: { $lt: todayStart },
        status: { $ne: 'closed' },
      };

      if (req.query.projectId) query.projectId = req.query.projectId;
      if (req.query.supervisorId) query.supervisorId = req.query.supervisorId;

      const rawSessions = await AttendanceSession.find(query)
        .populate('supervisorId', 'fullName role')
        .populate('projectId', 'nama lokasi')
        .sort({ date: -1, createdAt: -1 })
        .limit(100)
        .lean();

      const unclosedSessions = [];
      for (const s of rawSessions) {
        const computedStatus = computeSessionStatus(s);
        if (computedStatus === 'closed') {
          // Backfill if needed
          AttendanceSession.updateOne(
            { _id: s._id },
            { $set: { status: 'closed', closedAt: s.closedAt || s.date } }
          ).catch(() => {});
        } else {
          s.status = 'active';
          unclosedSessions.push(s);
        }
      }

      res.json({
        count: unclosedSessions.length,
        sessions: unclosedSessions,
      });
    } catch (error) {
      console.error('List unclosed sessions error:', error);
      res.status(500).json({ msg: 'Server error' });
    }
  }
);

// ─── GET /api/attendance-session ────────────────────────────────────────────
// List sessions (filterable by projectId, date range, status, paginated)
router.get(
  '/',
  auth,
  authorize(...SUPERVISOR_ROLES),
  async (req, res) => {
    try {
      const { projectId, date, startDate, endDate, page = 1, limit = 10, supervisorId, status, unclosedOnly } = req.query;

      const query = {};
      if (projectId) query.projectId = projectId;
      if (supervisorId) query.supervisorId = supervisorId;
      if (date) {
        const range = wibDayRange(date);
        if (range) {
          query.date = { $gte: range.start, $lte: range.end };
        }
      } else if (startDate || endDate) {
        query.date = {};
        if (startDate) {
          const sRange = wibDayRange(startDate);
          if (sRange) query.date.$gte = sRange.start;
        }
        if (endDate) {
          const eRange = wibDayRange(endDate);
          if (eRange) query.date.$lte = eRange.end;
        }
      } else if (unclosedOnly === 'true') {
        const todayStart = getTodayStart();
        query.date = { $lt: todayStart };
        query.status = { $ne: 'closed' };
      }

      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.max(1, Math.min(parseInt(limit) || 10, 100));

      const [rawSessions, total] = await Promise.all([
        AttendanceSession.find(query)
          .populate('supervisorId', 'fullName role')
          .populate('projectId', 'nama lokasi')
          .sort({ createdAt: -1 })
          .skip((pageNum - 1) * limitNum)
          .limit(limitNum)
          .lean(),
        AttendanceSession.countDocuments(query),
      ]);

      // Enrich status and backfill closed status if all workers clocked out
      let sessions = rawSessions.map(s => {
        const computedStatus = computeSessionStatus(s);
        if (computedStatus === 'closed' && s.status !== 'closed') {
          s.status = 'closed';
          s.closedAt = s.closedAt || nowWIB();
          AttendanceSession.updateOne(
            { _id: s._id },
            { $set: { status: 'closed', closedAt: s.closedAt } }
          ).catch(() => {});
        } else {
          s.status = computedStatus;
        }
        return s;
      });

      // Filter by status if specified in query
      if (status) {
        sessions = sessions.filter(s => s.status === status);
      }

      res.json({
        sessions,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      console.error('List attendance sessions error:', error);
      res.status(500).json({ msg: 'Server error' });
    }
  }
);

// ─── GET /api/attendance-session/:id ────────────────────────────────────────
// Get a single session with populated worker names
router.get(
  '/:id',
  auth,
  authorize(...SUPERVISOR_ROLES),
  async (req, res) => {
    try {
      const session = await AttendanceSession.findById(req.params.id)
        .populate('supervisorId', 'fullName role')
        .populate('projectId', 'nama lokasi')
        .populate('workerIds', 'fullName role position')
        .populate('lateWorkerIds.workerId', 'fullName role position')
        .populate('leaveRecords.workerId', 'fullName role position')
        .lean();

      if (!session) {
        return res.status(404).json({ msg: 'Session not found' });
      }

      const computedStatus = computeSessionStatus(session);
      if (computedStatus === 'closed' && session.status !== 'closed') {
        session.status = 'closed';
        session.closedAt = session.closedAt || nowWIB();
        AttendanceSession.updateOne(
          { _id: session._id },
          { $set: { status: 'closed', closedAt: session.closedAt } }
        ).catch(() => {});
      } else {
        session.status = computedStatus;
      }

      res.json(session);
    } catch (error) {
      console.error('Get attendance session error:', error);
      res.status(500).json({ msg: 'Server error' });
    }
  }
);

// ─── POST /api/attendance-session/:id/late-add ──────────────────────────────
// Add a late worker to an existing session
router.post(
  '/:id/late-add',
  auth,
  authorize(...SUPERVISOR_ROLES),
  async (req, res) => {
    try {
      const { workerId, clientTime } = req.body;
      if (!workerId) {
        return res.status(400).json({ msg: 'workerId is required' });
      }

      let recordTime = nowWIB();
      if (clientTime) {
        const parsed = new Date(clientTime);
        if (!isNaN(parsed.getTime())) {
          recordTime = parsed;
        }
      }

      const session = await AttendanceSession.findById(req.params.id);
      if (!session) {
        return res.status(404).json({ msg: 'Session not found' });
      }

      // Check if worker is already in the session
      const allWorkerIds = [
        ...session.workerIds.map(id => id.toString()),
        ...session.lateWorkerIds.map(lw => lw.workerId.toString()),
      ];
      if (allWorkerIds.includes(workerId)) {
        return res.status(400).json({ msg: 'Worker is already in this session' });
      }

      // Add to late workers
      session.lateWorkerIds.push({ workerId, addedAt: recordTime });
      await session.save();

      // Create/upsert individual Attendance record
      const today = session.date ? getTodayStart(session.date) : getTodayStart(recordTime);
      const existing = await Attendance.findOne({ userId: workerId, date: today });

      if (existing && existing.checkIn?.time) {
        return res.json({
          msg: 'Worker already checked in — attendance exists, added to session as late',
          session,
        });
      }

      if (existing) {
        await Attendance.updateOne(
          { _id: existing._id },
          {
            $set: {
              checkIn: {
                time: existing.checkIn?.time || recordTime,
                photo: existing.checkIn?.photo || session.photoUrl,
              },
              status: 'Late',
              projectId: session.projectId,
              sessionId: session._id,
            },
          }
        );
      } else {
        await Attendance.create({
          userId: workerId,
          date: today,
          checkIn: {
            time: recordTime,
            photo: session.photoUrl,
          },
          status: 'Late',
          projectId: session.projectId,
          sessionId: session._id,
          wageType: 'daily',
          wageMultiplier: 1,
        });
      }

      const user = await User.findById(workerId).select('fullName').lean();
      res.json({
        msg: `${user?.fullName || 'Worker'} added as late arrival`,
        session,
      });
    } catch (error) {
      console.error('Late add error:', error);
      res.status(500).json({ msg: 'Server error' });
    }
  }
);

// ─── POST /api/attendance-session/:id/leave-hour ────────────────────────────
// Record early departure for one or more workers (individual or bulk)
router.post(
  '/:id/leave-hour',
  auth,
  authorize(...SUPERVISOR_ROLES),
  async (req, res) => {
    try {
      const { workers, clientTime } = req.body;
      // workers = [{ workerId: "...", leaveHour: "14:30", reason: "..." }, ...]

      if (!workers || !Array.isArray(workers) || workers.length === 0) {
        return res.status(400).json({ msg: 'workers array is required with at least one entry' });
      }

      let recordTime = nowWIB();
      if (clientTime) {
        const parsed = new Date(clientTime);
        if (!isNaN(parsed.getTime())) {
          recordTime = parsed;
        }
      }

      const session = await AttendanceSession.findById(req.params.id);
      if (!session) {
        return res.status(404).json({ msg: 'Session not found' });
      }

      const today = session.date ? getTodayStart(session.date) : getTodayStart(recordTime);
      const results = [];

      for (const entry of workers) {
        if (!entry.workerId || !entry.leaveHour) {
          results.push({ workerId: entry.workerId, status: 'skipped', reason: 'Missing workerId or leaveHour' });
          continue;
        }

        // Validate leaveHour format (HH:mm)
        if (!/^\d{2}:\d{2}$/.test(entry.leaveHour)) {
          results.push({ workerId: entry.workerId, status: 'skipped', reason: 'Invalid leaveHour format. Use HH:mm' });
          continue;
        }

        // Add leave record to session
        session.leaveRecords.push({
          workerId: entry.workerId,
          leaveHour: entry.leaveHour,
          reason: entry.reason || '',
          recordedAt: recordTime,
        });

        // Update the individual Attendance record with check-out time
        const attendance = await Attendance.findOne({ userId: entry.workerId, date: today });
        if (attendance) {
          // Parse leaveHour to create a Date object for today in WIB (UTC+7)
          const [hours, minutes] = entry.leaveHour.split(':').map(Number);
          const leaveDate = new Date(today);
          const wibDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(today);
          const leaveDateWIB = new Date(`${wibDateStr}T${entry.leaveHour}:00+07:00`);

          attendance.checkOut = {
            time: leaveDateWIB,
          };

          // If leaving before 12:00 WIB, mark as Half-day
          if (hours < 12) {
            attendance.status = 'Half-day';
          }

          attendance.notes = [attendance.notes, `[Pulang Awal ${entry.leaveHour}] ${entry.reason || ''}`.trim()]
            .filter(Boolean)
            .join('\n');

          await attendance.save();
          results.push({ workerId: entry.workerId, status: 'recorded', leaveHour: entry.leaveHour });
        } else {
          results.push({ workerId: entry.workerId, status: 'skipped', reason: 'No attendance record found for today' });
        }
      }

      // Check if all workers in this session have now clocked out
      const allWorkerIds = [
        ...session.workerIds.map(id => id.toString()),
        ...session.lateWorkerIds.map(lw => (lw.workerId?._id || lw.workerId).toString()),
      ];
      const leftWorkerIds = session.leaveRecords.map(lr => (lr.workerId?._id || lr.workerId).toString());
      const allLeft = allWorkerIds.length > 0 && allWorkerIds.every(id => leftWorkerIds.includes(id));

      if (allLeft) {
        session.status = 'closed';
        session.closedAt = recordTime;
        session.closedBy = req.user._id;
      }

      await session.save();

      res.json({
        msg: `Leave recorded for ${results.filter(r => r.status === 'recorded').length} workers.${allLeft ? ' Seluruh pekerja telah clock-out, sesi ditutup.' : ''}`,
        results,
        isClosed: allLeft,
        session,
      });
    } catch (error) {
      console.error('Leave hour error:', error);
      res.status(500).json({ msg: 'Server error' });
    }
  }
);

// ─── POST /api/attendance-session/:id/close ────────────────────────────────
// Explicitly close a session, optionally clocking out all remaining workers
router.post(
  '/:id/close',
  auth,
  authorize(...SUPERVISOR_ROLES),
  async (req, res) => {
    try {
      const { defaultLeaveHour, reason, clientTime } = req.body;
      const session = await AttendanceSession.findById(req.params.id);
      if (!session) {
        return res.status(404).json({ msg: 'Session not found' });
      }

      let recordTime = nowWIB();
      if (clientTime) {
        const parsed = new Date(clientTime);
        if (!isNaN(parsed.getTime())) {
          recordTime = parsed;
        }
      }

      const today = session.date ? getTodayStart(session.date) : getTodayStart(recordTime);
      const allWorkerIds = [
        ...session.workerIds.map(id => id.toString()),
        ...session.lateWorkerIds.map(lw => (lw.workerId?._id || lw.workerId).toString()),
      ];
      const alreadyLeftIds = session.leaveRecords.map(lr => (lr.workerId?._id || lr.workerId).toString());
      const remainingWorkerIds = allWorkerIds.filter(id => !alreadyLeftIds.includes(id));

      const isPastSession = session.date && session.date < getTodayStart();
      const finalLeaveHour = defaultLeaveHour || (isPastSession ? '17:00' : new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(recordTime));

      if (remainingWorkerIds.length > 0) {
        const [hours] = finalLeaveHour.split(':').map(Number);
        const wibDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(today);
        const leaveDateWIB = new Date(`${wibDateStr}T${finalLeaveHour}:00+07:00`);

        for (const wId of remainingWorkerIds) {
          session.leaveRecords.push({
            workerId: wId,
            leaveHour: finalLeaveHour,
            reason: reason || (isPastSession ? 'Clock-out susulan sesi lampau oleh supervisor' : 'Clock-out otomatis saat sesi ditutup oleh supervisor'),
            recordedAt: recordTime,
          });

          const attendance = await Attendance.findOne({ userId: wId, date: today });
          if (attendance) {
            attendance.checkOut = { time: leaveDateWIB };
            if (hours < 12) attendance.status = 'Half-day';
            await attendance.save();
          }
        }
      }

      session.status = 'closed';
      session.closedAt = recordTime;
      session.closedBy = req.user._id;
      await session.save();

      res.json({
        msg: `Sesi berhasil ditutup. ${remainingWorkerIds.length} pekerja telah di-clockout.`,
        session,
        remainingClockedOut: remainingWorkerIds.length,
      });
    } catch (error) {
      console.error('Close session error:', error);
      res.status(500).json({ msg: 'Server error' });
    }
  }
);

// ─── DELETE /api/attendance-session/:id ─────────────────────────────────────
// Eliminate an attendance session and its linked worker attendance records (e.g. accidental double clock-in)
router.delete(
  '/:id',
  auth,
  authorize(...SUPERVISOR_ROLES),
  async (req, res) => {
    try {
      const session = await AttendanceSession.findById(req.params.id);
      if (!session) {
        return res.status(404).json({ msg: 'Sesi absensi tidak ditemukan' });
      }

      // Check permission: creator of session OR management roles
      const currentUserId = (req.user._id || req.user.userId || '').toString();
      const isCreator = currentUserId && session.supervisorId.toString() === currentUserId;
      const isAdminOrDirector = [
        'owner', 'president_director', 'operational_director',
        'director', 'admin_project'
      ].includes(req.user.role);

      if (!isCreator && !isAdminOrDirector) {
        return res.status(403).json({
          msg: 'Anda hanya dapat menghapus sesi absensi yang Anda buat sendiri.'
        });
      }

      // Safety check: prevent deleting if any attendance record has already been Paid
      const paidCount = await Attendance.countDocuments({
        sessionId: session._id,
        paymentStatus: 'Paid',
      });
      if (paidCount > 0) {
        return res.status(400).json({
          msg: `Tidak dapat menghapus sesi: ${paidCount} data absensi pekerja sudah berstatus Dibayar (Paid).`
        });
      }

      // Delete attendance records linked to this session
      const deleteAttendanceResult = await Attendance.deleteMany({
        sessionId: session._id,
      });

      // Remove photo file from disk if locally stored
      if (session.photoUrl && session.photoUrl.startsWith('uploads/')) {
        const fullPhotoPath = path.join(__dirname, '../../', session.photoUrl);
        if (fs.existsSync(fullPhotoPath)) {
          fs.unlink(fullPhotoPath, (err) => {
            if (err) console.warn('[SessionDelete] Failed to remove photo file:', err.message);
          });
        }
      }

      // Delete the session document itself
      await AttendanceSession.deleteOne({ _id: session._id });

      res.json({
        msg: 'Sesi absensi dan catatan absensi pekerja terkait berhasil dihapus.',
        sessionId: session._id,
        deletedAttendanceCount: deleteAttendanceResult.deletedCount,
      });
    } catch (error) {
      console.error('Delete attendance session error:', error);
      res.status(500).json({ msg: 'Server error saat menghapus sesi absensi' });
    }
  }
);

module.exports = router;

