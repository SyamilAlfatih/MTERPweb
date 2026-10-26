const mongoose = require('mongoose');

const binSchema = new mongoose.Schema({
  label: {
    type: String,
    required: true,
    trim: true,
  }, // e.g. "A-01", "Level 2 Bin 3"
  capacity: {
    type: Number,
    default: 0,
  },
  notes: {
    type: String,
    trim: true,
  },
});

const rackSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  }, // e.g. "Rak 1", "Lemari Besi A"
  bins: [binSchema],
});

const zoneSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  }, // e.g. "Zona A - Tool Crib", "Zona B - Heavy Machinery"
  code: {
    type: String,
    trim: true,
    uppercase: true,
  }, // e.g. "Z-A"
  racks: [rackSchema],
});

const warehouseSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  code: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    unique: true,
  },
  type: {
    type: String,
    enum: ['head_office', 'central_warehouse', 'project_site', 'workshop', 'transit'],
    default: 'central_warehouse',
  },
  address: {
    type: String,
    trim: true,
  },
  geo: {
    lat: {
      type: Number,
      default: -7.175077420272807,
    },
    lng: {
      type: Number,
      default: 107.57089981757514,
    },
    radiusMeters: {
      type: Number,
      default: 150,
    },
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    default: null,
  },
  managerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  zones: [zoneSchema],
  isDefault: {
    type: Boolean,
    default: false,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

warehouseSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

warehouseSchema.pre('findOneAndUpdate', function (next) {
  this.set({ updatedAt: new Date() });
  next();
});

warehouseSchema.index({ name: 'text', code: 'text', address: 'text' });

module.exports = mongoose.model('Warehouse', warehouseSchema);
