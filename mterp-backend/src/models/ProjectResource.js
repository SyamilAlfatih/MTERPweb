const mongoose = require('mongoose');

const projectResourceSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
    index: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  type: {
    type: String,
    enum: ['Work', 'Material', 'Cost'],
    default: 'Work',
  },
  materialLabel: {
    type: String,
    default: '',
    trim: true,
  },
  initials: {
    type: String,
    default: '',
    trim: true,
  },
  group: {
    type: String,
    default: '',
    trim: true,
  },
  maxUnits: {
    type: Number,
    default: 100, // 100% = 1 full-time worker
    min: 0,
  },
  standardRate: {
    type: Number,
    default: 0, // Daily rate in Rupiah
    min: 0,
  },
  overtimeRate: {
    type: Number,
    default: 0,
    min: 0,
  },
  costPerUse: {
    type: Number,
    default: 0,
    min: 0,
  },
  accrueAt: {
    type: String,
    enum: ['Start', 'Prorated', 'End'],
    default: 'Prorated',
  },
  baseCalendar: {
    type: String,
    default: 'Standard',
  },
  code: {
    type: String,
    default: '',
    trim: true,
  },
  notes: {
    type: String,
    default: '',
  },
}, {
  timestamps: true,
});

projectResourceSchema.index({ projectId: 1, name: 1 });

const ProjectResource = mongoose.model('ProjectResource', projectResourceSchema);

module.exports = ProjectResource;
