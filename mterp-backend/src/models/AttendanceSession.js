const mongoose = require('mongoose');

const attendanceSessionSchema = new mongoose.Schema({
  supervisorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
    index: true,
  },
  date: {
    type: Date,
    required: true,
    index: true,
  },
  photoUrl: {
    type: String,
    required: true,
  },
  workerIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  // Workers added late (after initial submission)
  lateWorkerIds: [{
    workerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
  }],
  // Workers who left early
  leaveRecords: [{
    workerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    leaveHour: {
      type: String, // e.g. "14:30"
      required: true,
    },
    reason: String,
    recordedAt: {
      type: Date,
      default: Date.now,
    },
  }],
  notes: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Compound index for querying sessions by project + date
attendanceSessionSchema.index({ projectId: 1, date: 1 });

module.exports = mongoose.model('AttendanceSession', attendanceSessionSchema);
