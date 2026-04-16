const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  date: {
    type: Date,
    required: true,
    index: true,
  },
  checkIn: {
    time: Date,
    photo: String,
    location: {
      lat: Number,
      lng: Number,
    },
  },
  checkOut: {
    time: Date,
    photo: String,
    location: {
      lat: Number,
      lng: Number,
    },
  },
  wageType: {
    type: String,
    enum: ['daily', 'overtime_1.5', 'overtime_2', 'overtime'],
    default: 'daily',
  },
  wageMultiplier: {
    type: Number,
    default: 1,
  },
  dailyRate: {
    type: Number,
    default: 0,
  },
  hourlyRate: {
    type: Number,
    default: 0,
  },
  overtimePay: {
    type: Number,
    default: 0,
  },
  paymentStatus: {
    type: String,
    enum: ['Unpaid', 'Paid'],
    default: 'Unpaid',
  },
  paidAt: Date,
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
  },
  notes: String,
  status: {
    type: String,
    enum: ['Present', 'Absent', 'Late', 'Half-day', 'Permit'],
    default: 'Present',
  },
  permit: {
    reason: String,
    evidence: String,
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected'],
      default: 'Pending',
    }
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Compound index for user + date uniqueness
attendanceSchema.index({ userId: 1, date: 1 }, { unique: true });
// Compound index for sorting
attendanceSchema.index({ userId: 1, date: -1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
