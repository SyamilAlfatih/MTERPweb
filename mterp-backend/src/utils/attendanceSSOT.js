const mongoose = require('mongoose');
const { wibDayRange, nowWIB } = require('./date');

/**
 * Returns date key in YYYY-MM-DD format anchored to Asia/Jakarta (WIB).
 * @param {string|Date} dateInput
 * @returns {string}
 */
function getWibDateKey(dateInput) {
  if (!dateInput) return '';
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(d);
}

/**
 * Single Source of Truth for Overtime Calculation:
 * Upah Lembur per jam = Upah Harian / 8 (e.g. 120.000 / 8 = 15.000).
 * Total Upah Lembur = Jam Lembur * (Upah Harian / 8).
 *
 * @param {number} dailyRate - Upah harian (IDR)
 * @param {number} overtimeHours - Jam lembur
 * @returns {{ hourlyRate: number, overtimePay: number }}
 */
function calculateStandardOvertime(dailyRate, overtimeHours) {
  const rate = Math.max(0, Number(dailyRate) || 0);
  const hours = Math.max(0, Number(overtimeHours) || 0);
  const hourlyRate = rate > 0 ? Math.round(rate / 8) : 15000;
  const overtimePay = Math.round(hours * hourlyRate);
  return { hourlyRate, overtimePay };
}

/**
 * Priority order for attendance status when merging duplicates
 */
const STATUS_PRIORITY = {
  Present: 5,
  Late: 4,
  'Half-day': 3,
  Permit: 2,
  Absent: 1,
};

/**
 * Deduplicates attendance records in-memory so every (worker, WIB date) is represented AT MOST ONCE.
 * Eliminates double-input errors where recap and log records both exist for the same day.
 *
 * @param {Array} records - Array of attendance records (plain objects or documents)
 * @returns {Array} Deduplicated records
 */
function deduplicateAttendanceRecords(records) {
  if (!Array.isArray(records) || records.length === 0) return [];

  const grouped = new Map();

  for (const record of records) {
    if (!record) continue;
    const uid = record.userId?._id?.toString() || record.userId?.toString();
    if (!uid) continue;

    const dateKey = getWibDateKey(record.date);
    if (!dateKey) continue;

    const key = `${uid}_${dateKey}`;
    if (!grouped.has(key)) {
      grouped.set(key, [record]);
    } else {
      grouped.get(key).push(record);
    }
  }

  const mergedList = [];

  for (const [key, group] of grouped.entries()) {
    if (group.length === 1) {
      mergedList.push(group[0]);
      continue;
    }

    // Multiple records exist for the same user on the same calendar day (double input)
    // Merge them into one canonical record
    let primary = group[0];
    let maxRate = 0;
    let bestStatus = primary.status || 'Present';
    let totalOtHours = 0;
    let totalOtPay = 0;
    let hasCheckIn = null;
    let hasCheckOut = null;
    let hasPermit = null;
    let projId = primary.projectId;
    let otProjId = primary.overtimeProjectId;
    let notesArr = [];

    for (const r of group) {
      if ((r.dailyRate || 0) > maxRate) {
        maxRate = r.dailyRate;
      }
      if ((STATUS_PRIORITY[r.status] || 0) > (STATUS_PRIORITY[bestStatus] || 0)) {
        bestStatus = r.status;
      }
      if (r.overtimeHours && r.overtimeHours > totalOtHours) {
        totalOtHours = r.overtimeHours;
      }
      if (r.overtimePay && r.overtimePay > totalOtPay) {
        totalOtPay = r.overtimePay;
      }
      if (r.checkIn?.time && !hasCheckIn) {
        hasCheckIn = r.checkIn;
      }
      if (r.checkOut?.time && !hasCheckOut) {
        hasCheckOut = r.checkOut;
      }
      if (r.permit?.reason && !hasPermit) {
        hasPermit = r.permit;
      }
      if (r.projectId) projId = r.projectId;
      if (r.overtimeProjectId) otProjId = r.overtimeProjectId;
      if (r.notes && !notesArr.includes(r.notes)) {
        notesArr.push(r.notes);
      }
    }

    // SSOT OT recalculation
    const { hourlyRate, overtimePay: standardOtPay } = calculateStandardOvertime(maxRate, totalOtHours);
    const finalOtPay = totalOtPay > 0 ? totalOtPay : standardOtPay;

    const canonical = {
      ...primary,
      status: bestStatus,
      dailyRate: bestStatus === 'Absent' ? 0 : (bestStatus === 'Half-day' ? Math.round(maxRate / 2) : maxRate),
      hourlyRate,
      overtimeHours: totalOtHours,
      overtimePay: finalOtPay,
      projectId: projId,
      overtimeProjectId: otProjId,
      checkIn: hasCheckIn || primary.checkIn,
      checkOut: hasCheckOut || primary.checkOut,
      permit: hasPermit || primary.permit,
      notes: notesArr.join(' | '),
      wageType: totalOtHours > 0 ? 'overtime' : 'daily',
    };

    mergedList.push(canonical);
  }

  return mergedList;
}

/**
 * Finds all attendance records for a user on a given WIB date.
 * @param {Model} AttendanceModel
 * @param {string|ObjectId} userId
 * @param {string|Date} dateInput
 * @returns {Promise<Array>}
 */
async function findAttendanceRecordsForDay(AttendanceModel, userId, dateInput) {
  const range = wibDayRange(dateInput || nowWIB());
  if (!range) return [];
  return AttendanceModel.find({
    userId,
    date: { $gte: range.start, $lte: range.end },
  });
}

/**
 * Canonical Upsert: guarantees exactly ONE record per (userId, WIB day).
 * If multiple records exist, merges them and removes the extras.
 *
 * @param {Model} AttendanceModel
 * @param {object} params
 * @returns {Promise<Document>}
 */
async function canonicalUpsertAttendance(AttendanceModel, params) {
  const {
    userId,
    date,
    status,
    dailyRate,
    overtimeHours,
    overtimePay,
    projectId,
    overtimeProjectId,
    checkInTime,
    checkOutTime,
    notes,
    workType,
    officeLocation,
    permit,
    spklId,
    paymentStatus,
  } = params;

  const range = wibDayRange(date || nowWIB());
  if (!range) throw new Error('Invalid date provided for attendance upsert');

  const existingRecords = await AttendanceModel.find({
    userId,
    date: { $gte: range.start, $lte: range.end },
  });

  let primary = existingRecords.length > 0 ? existingRecords[0] : null;

  // If duplicate records already exist in the database for this date, delete extras
  if (existingRecords.length > 1) {
    const extraIds = existingRecords.slice(1).map(r => r._id);
    await AttendanceModel.deleteMany({ _id: { $in: extraIds } });
  }

  const targetStatus = status || primary?.status || 'Present';
  const baselineRate = dailyRate !== undefined && Number(dailyRate) >= 0
    ? Number(dailyRate)
    : (primary?.dailyRate || 0);

  const otHours = overtimeHours !== undefined
    ? Math.max(0, Number(overtimeHours) || 0)
    : (primary?.overtimeHours || 0);

  const { hourlyRate, overtimePay: calculatedOtPay } = calculateStandardOvertime(baselineRate, otHours);
  const finalOtPay = overtimePay !== undefined && Number(overtimePay) >= 0
    ? Number(overtimePay)
    : calculatedOtPay;

  const effectiveDailyRate = targetStatus === 'Absent'
    ? 0
    : (targetStatus === 'Half-day' ? Math.round(baselineRate / 2) : baselineRate);

  if (primary) {
    if (status) primary.status = targetStatus;
    primary.date = range.start; // Normalize to WIB day start
    primary.dailyRate = effectiveDailyRate;
    primary.hourlyRate = hourlyRate;
    primary.overtimeHours = targetStatus === 'Absent' ? 0 : otHours;
    primary.overtimePay = targetStatus === 'Absent' ? 0 : finalOtPay;
    primary.wageType = otHours > 0 ? 'overtime' : 'daily';
    primary.wageMultiplier = 1;

    if (projectId !== undefined) {
      primary.projectId = (projectId && mongoose.Types.ObjectId.isValid(projectId)) ? projectId : null;
    }
    if (overtimeProjectId !== undefined) {
      primary.overtimeProjectId = (overtimeProjectId && mongoose.Types.ObjectId.isValid(overtimeProjectId)) ? overtimeProjectId : null;
    }
    if (notes !== undefined) {
      primary.notes = notes;
    }
    if (workType) primary.workType = workType;
    if (officeLocation !== undefined) primary.officeLocation = officeLocation;
    if (spklId) primary.spklId = spklId;
    if (paymentStatus) primary.paymentStatus = paymentStatus;

    if (targetStatus === 'Absent') {
      primary.checkIn = undefined;
      primary.checkOut = undefined;
    } else if (targetStatus === 'Permit') {
      primary.checkIn = undefined;
      primary.checkOut = undefined;
      primary.permit = permit || {
        reason: notes || 'Izin / Sakit via Rekapitulasi',
        status: 'Approved',
      };
    } else {
      if (checkInTime) {
        if (!primary.checkIn) primary.checkIn = {};
        primary.checkIn.time = checkInTime instanceof Date ? checkInTime : new Date(checkInTime);
      }
      if (checkOutTime) {
        if (!primary.checkOut) primary.checkOut = {};
        primary.checkOut.time = checkOutTime instanceof Date ? checkOutTime : new Date(checkOutTime);
      }
    }

    primary.invalidatedBy = undefined;
    primary.invalidatedAt = undefined;
    await primary.save();
    return primary;
  }

  // Create new canonical record
  const newRec = new AttendanceModel({
    userId,
    date: range.start, // Always anchored to WIB start
    status: targetStatus,
    dailyRate: effectiveDailyRate,
    hourlyRate,
    overtimeHours: targetStatus === 'Absent' ? 0 : otHours,
    overtimePay: targetStatus === 'Absent' ? 0 : finalOtPay,
    wageType: otHours > 0 ? 'overtime' : 'daily',
    wageMultiplier: 1,
    paymentStatus: paymentStatus || 'Unpaid',
    projectId: (projectId && mongoose.Types.ObjectId.isValid(projectId)) ? projectId : undefined,
    overtimeProjectId: (overtimeProjectId && mongoose.Types.ObjectId.isValid(overtimeProjectId)) ? overtimeProjectId : undefined,
    notes: notes || undefined,
    workType: workType || 'Project',
    officeLocation: officeLocation || '',
    spklId: spklId || undefined,
    permit: targetStatus === 'Permit' ? (permit || {
      reason: notes || 'Izin / Sakit via Rekapitulasi',
      status: 'Approved',
    }) : undefined,
    checkIn: ['Present', 'Late', 'Half-day'].includes(targetStatus) && checkInTime ? {
      time: checkInTime instanceof Date ? checkInTime : new Date(checkInTime),
    } : undefined,
    checkOut: ['Present', 'Late', 'Half-day'].includes(targetStatus) && checkOutTime ? {
      time: checkOutTime instanceof Date ? checkOutTime : new Date(checkOutTime),
    } : undefined,
  });

  await newRec.save();
  return newRec;
}

module.exports = {
  getWibDateKey,
  calculateStandardOvertime,
  deduplicateAttendanceRecords,
  findAttendanceRecordsForDay,
  canonicalUpsertAttendance,
};
