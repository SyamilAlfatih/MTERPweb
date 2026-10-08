const mongoose = require('mongoose');

const workItemSchema = new mongoose.Schema({
  itemNo: { type: Number, required: true },
  taskDescription: { type: String, required: true, trim: true },
  volumePlanned: { type: String, default: '', trim: true },
  volumeActual: { type: String, default: '', trim: true },
  isFinished: { type: Boolean, default: false },
  progressPercent: { type: Number, min: 0, max: 100, default: 0 },
}, { _id: false });

const scheduleSchema = new mongoose.Schema({
  startTime: { type: String, required: true, trim: true }, // "HH:mm"
  endTime: { type: String, required: true, trim: true },   // "HH:mm"
  breakMinutes: { type: Number, default: 0 },              // e.g. 30
  effectiveHours: { type: Number, required: true },        // e.g. 4.0
}, { _id: false });

const spklSchema = new mongoose.Schema({
  spklNumber: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    index: true,
  },
  batchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SPKLBatch',
    default: null,
    index: true,
  },

  // I. Identitas Karyawan / Pelaksana Lembur
  workerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  workerSnapshot: {
    fullName: { type: String, required: true },
    nik: { type: String, default: '' },
    department: { type: String, default: 'Operasional Lapangan' },
    position: { type: String, default: '' },
    dailyRate: { type: Number, default: 0 },
    hourlyRate: { type: Number, default: 0 },
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
    index: true,
  },
  location: {
    type: String,
    required: true,
    trim: true,
  },

  // II. Jadwal & Realisasi Waktu Lembur
  overtimeDate: {
    type: Date,
    required: true,
    index: true,
  },
  schedulePlan: {
    type: scheduleSchema,
    required: true,
  },
  scheduleActual: {
    type: scheduleSchema,
    required: true,
  },

  // Perhitungan Upah Lembur & Kompensasi
  compensation: {
    rateScheme: {
      type: String,
      enum: ['standard_pp35', 'flat_1.0', 'flat_1.5', 'flat_2.0', 'custom'],
      default: 'standard_pp35',
    },
    hourlyRate: { type: Number, default: 0 },
    effectiveHours: { type: Number, default: 0 },
    multiplier: { type: Number, default: 1.5 },
    totalPay: { type: Number, default: 0 },
    manualOverridePay: { type: Number, default: null },
  },

  // III. Rincian Pekerjaan & Hasil Yang Dicapai (Output)
  workItems: {
    type: [workItemSchema],
    default: [],
  },

  // IV. Tanda Tangan Persetujuan & Verifikasi
  workflowStatus: {
    type: String,
    enum: [
      'draft',
      'submitted',
      'supervisor_verified',
      'pm_approved',
      'finance_verified',
      'rejected',
    ],
    default: 'submitted',
    index: true,
  },
  rejectionReason: {
    type: String,
    default: '',
  },
  signatures: {
    worker: {
      signed: { type: Boolean, default: false },
      signedAt: Date,
      signedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      signatureHash: String,
    },
    supervisor: {
      signed: { type: Boolean, default: false },
      signedAt: Date,
      signedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      signatureHash: String,
      note: String,
    },
    projectManager: {
      signed: { type: Boolean, default: false },
      signedAt: Date,
      signedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      signatureHash: String,
      note: String,
    },
    financeDirector: {
      signed: { type: Boolean, default: false },
      signedAt: Date,
      signedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      signatureHash: String,
      note: String,
    },
  },

  // Assigned Verifiers / Approvers
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

  // Synchronization with Attendance
  attendanceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Attendance',
    default: null,
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
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

spklSchema.index({ workerId: 1, overtimeDate: 1 });
spklSchema.index({ projectId: 1, overtimeDate: 1 });

module.exports = mongoose.model('SPKL', spklSchema);

