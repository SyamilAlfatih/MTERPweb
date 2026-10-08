const mongoose = require('mongoose');

const spklBatchSchema = new mongoose.Schema({
  batchNumber: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    index: true,
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
    index: true,
  },
  department: {
    type: String,
    required: true,
    default: 'Operasional Lapangan',
  },
  location: {
    type: String,
    required: true,
  },
  overtimeDate: {
    type: Date,
    required: true,
    index: true,
  },
  workerCount: {
    type: Number,
    required: true,
    min: 1,
  },
  spklIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SPKL',
  }],
  status: {
    type: String,
    enum: ['in_progress', 'partially_approved', 'all_verified', 'closed'],
    default: 'in_progress',
  },
  sharedSchedule: {
    startTime: String,
    endTime: String,
    breakMinutes: Number,
    effectiveHours: Number,
  },
  sharedWorkItems: [{
    itemNo: Number,
    taskDescription: String,
    volumePlanned: String,
    volumeActual: String,
    isFinished: Boolean,
    progressPercent: Number,
  }],
  assignedSupervisorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  assignedPmId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  assignedFinanceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

module.exports = mongoose.model('SPKLBatch', spklBatchSchema);
