const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { SlipGaji, Attendance, Kasbon } = require('../models');
const { getProjectWeekRange, nowWIB, wibDayRange } = require('../utils/date');

/**
 * Migration / Patch: Tag all previous weeks' slips and attendance as 'paid'
 * Feature context: Payment finalization with proof started just this week.
 * All previous weeks were settled in real life before this feature existed.
 */
async function tagPreviousWeeksPaid(options = { autoClose: true }) {
  const isDirectRun = require.main === module;
  if (isDirectRun) {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mterp';
    await mongoose.connect(mongoUri);
    console.log('[Migration] Connected to MongoDB:', mongoUri);
  }

  try {
    const currentWeek = getProjectWeekRange(nowWIB(), 1, 6);
    const cutoffDate = currentWeek.startDate; // Monday 00:00:00 WIB of current week
    console.log(`[Migration] Current week start (cutoff): ${currentWeek.startStr} (${cutoffDate.toISOString()})`);

    // 1. Find all slips where period ended before this week that are not marked paid
    const previousSlips = await SlipGaji.find({
      'period.endDate': { $lt: cutoffDate },
      status: { $ne: 'paid' },
    });

    console.log(`[Migration] Found ${previousSlips.length} previous week slips with status != 'paid'`);

    let slipsUpdated = 0;
    let attendanceSynced = 0;

    for (const slip of previousSlips) {
      const settledAt = slip.period?.endDate || slip.createdAt || nowWIB();

      slip.status = 'paid';
      slip.paidAt = settledAt;
      if (!slip.paymentProof || !slip.paymentProof.fileName) {
        slip.paymentProof = {
          fileUrl: '',
          fileName: 'Legacy Settlement (Pre-Feature)',
          uploadedAt: settledAt,
          notes: 'Otomatis ditandai Lunas (Pembayaran periode sebelum fitur bukti transfer aktif)',
          amountPaid: slip.earnings?.netPay || 0,
          paymentDate: settledAt,
        };
      }
      await slip.save();
      slipsUpdated++;

      // Sync attendance records in slip period
      const startRange = wibDayRange(slip.period.startDate);
      const endRange = wibDayRange(slip.period.endDate);
      const dateStart = startRange ? startRange.start : new Date(slip.period.startDate);
      const dateEnd = endRange ? endRange.end : new Date(new Date(slip.period.endDate).setHours(23, 59, 59, 999));

      const attFilter = {
        userId: slip.workerId,
        date: { $gte: dateStart, $lte: dateEnd },
      };
      if (slip.projectId) {
        attFilter.$or = [
          { projectId: slip.projectId },
          { overtimeProjectId: slip.projectId },
        ];
      } else {
        attFilter.projectId = { $in: [null, undefined] };
      }

      const attRes = await Attendance.updateMany(attFilter, {
        $set: {
          paymentStatus: 'Paid',
          paidAt: settledAt,
        },
      });
      attendanceSynced += (attRes.modifiedCount || 0);

      // Sync Kasbon if deducted
      if (slip.earnings?.kasbonDeduction > 0) {
        await Kasbon.updateMany(
          {
            userId: slip.workerId,
            status: 'Approved',
            createdAt: { $gte: dateStart, $lte: dateEnd },
          },
          {
            $set: {
              status: 'Paid',
              paidAt: settledAt,
            },
          }
        );
      }

      console.log(`  ✓ Slip ${slip.slipNumber} (${slip.period.startDate.toISOString().split('T')[0]} - ${slip.period.endDate.toISOString().split('T')[0]}) -> LUNAS`);
    }

    // 2. Also tag any historical attendance records prior to current week that remain Unpaid
    const attResult = await Attendance.updateMany(
      {
        date: { $lt: cutoffDate },
        paymentStatus: 'Unpaid',
      },
      {
        $set: {
          paymentStatus: 'Paid',
          paidAt: cutoffDate,
        },
      }
    );

    const legacyAttCount = attResult.modifiedCount || 0;
    console.log(`[Migration] Updated ${legacyAttCount} additional legacy attendance records before ${currentWeek.startStr} to Paid`);

    const result = {
      success: true,
      cutoffDate: cutoffDate.toISOString(),
      slipsUpdated,
      attendanceSynced,
      legacyAttendanceUpdated: legacyAttCount,
    };

    console.log('[Migration] Summary:', result);
    return result;
  } catch (error) {
    console.error('[Migration Error]:', error);
    throw error;
  } finally {
    if (isDirectRun && options.autoClose) {
      await mongoose.disconnect();
      console.log('[Migration] Database disconnected.');
    }
  }
}

if (require.main === module) {
  tagPreviousWeeksPaid()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { tagPreviousWeeksPaid };
