const mongoose = require('mongoose');

// GeoJSON Point Schema (standard [longitude, latitude] coordinates)
const pointSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['Point'],
    default: 'Point',
  },
  coordinates: {
    type: [Number], // [longitude, latitude]
    required: true,
  },
}, { _id: false });

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
    geoPoint: pointSchema,
    distanceToOffice: Number, // distance in meters to office location
    geofenceStatus: {
      type: String,
      enum: ['in_radius', 'out_of_range', 'exempt_wfh', 'exempt_dinas'],
      default: 'in_radius',
    },
    isGroupPhoto: Boolean,
  },
  checkOut: {
    time: Date,
    photo: String,
    location: {
      lat: Number,
      lng: Number,
    },
    geoPoint: pointSchema,
    distanceToOffice: Number,
    geofenceStatus: {
      type: String,
      enum: ['in_radius', 'out_of_range', 'exempt_wfh', 'exempt_dinas'],
      default: 'in_radius',
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
  overtimeHours: {
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
  overtimeProjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
  },
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AttendanceSession',
  },
  notes: String,
  workType: {
    type: String,
    enum: ['WFO', 'WFH', 'Dinas', 'Project'],
    default: 'Project',
  },
  officeLocation: {
    type: String,
    default: '',
  },
  workSummary: {
    type: String,
    default: '',
  },
  category: {
    type: String,
    enum: ['site', 'office'],
    default: 'site',
  },
  status: {
    type: String,
    enum: ['Present', 'Absent', 'Late', 'Half-day', 'Permit'],
    default: 'Present',
  },
  permit: {
    reason: String,
    evidence: String,
    permitType: {
      type: String,
      default: 'Izin',
    },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected'],
      default: 'Pending',
    }
  },
  // Invalidation audit trail (supervisor correcting accidental check-ins)
  invalidatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  invalidatedAt: Date,
  invalidatedReason: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Compound index for user + date uniqueness
attendanceSchema.index({ userId: 1, date: 1 }, { unique: true });
// Compound index for sorting
attendanceSchema.index({ userId: 1, date: -1 });
// Spatial 2dsphere index for GeoJSON proximity & geofencing queries
attendanceSchema.index({ 'checkIn.geoPoint': '2dsphere' }, { sparse: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
