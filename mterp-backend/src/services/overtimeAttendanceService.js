const { Attendance, SPKL, SPKLBatch } = require('../models');

/**
 * Parses time string "HH:mm" to minutes from midnight
 * @param {string} timeStr - Time string formatted as "HH:mm"
 * @returns {number} Minutes from midnight
 */
function parseTimeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Calculates effective hours between startTime and endTime deducting breakMinutes.
 * Supports overnight shifts (e.g. 21:00 to 02:00 next day).
 *
 * @param {string} startTime - "HH:mm"
 * @param {string} endTime - "HH:mm"
 * @param {number} [breakMinutes=0]
 * @returns {number} Effective hours rounded to 1 decimal place
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
 * Calculates overtime pay based on hourly rate, hours, and rate scheme.
 * Default is Indonesian Labor Law (PP 35/2021) standard weekday formula.
 *
 * @param {number} hourlyRate
 * @param {number} hours
 * @param {string} [rateScheme='standard_pp35']
 * @param {number} [multiplier=1.5]
 * @returns {number} Total overtime compensation in IDR
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
 *
 * @param {Date|string} date
 * @param {object} [session=null]
 * @returns {Promise<string>}
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
 *
 * @param {Date|string} date
 * @param {object} [session=null]
 * @returns {Promise<string>}
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
 * Synchronizes verified SPKL record into Attendance collection atomically
 *
 * @param {object} spkl
 * @param {object} [session=null]
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

  const effectivePay =
    spkl.compensation.manualOverridePay !== null && spkl.compensation.manualOverridePay !== undefined
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

module.exports = {
  parseTimeToMinutes,
  calculateEffectiveHours,
  calculateOvertimePay,
  generateNextSpklNumber,
  generateNextBatchNumber,
  syncSpklToAttendance,
};
