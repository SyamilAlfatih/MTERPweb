const mongoose = require('mongoose');

const toolMovementSchema = new mongoose.Schema({
  toolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tool',
    required: true,
    index: true,
  },
  fromWarehouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    default: null,
  },
  fromBin: {
    type: String,
    trim: true,
  },
  fromLokasi: {
    type: String,
    trim: true,
  },
  toWarehouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    default: null,
  },
  toBin: {
    type: String,
    trim: true,
  },
  toLokasi: {
    type: String,
    trim: true,
  },
  action: {
    type: String,
    enum: [
      'check_out',
      'return',
      'hand_over',
      'transfer',
      'relocation',
      'maintenance_in',
      'maintenance_out',
      'condition_change',
      'initial_register',
    ],
    required: true,
    index: true,
  },
  qty: {
    type: Number,
    default: 1,
    min: 1,
  },
  byUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    default: null,
  },
  condition: {
    type: String,
    enum: ['Baik', 'Rusak', 'Maintenance'],
    default: 'Baik',
  },
  evidence: {
    photo: {
      type: String,
      default: null,
    },
    lat: {
      type: Number,
      default: null,
    },
    lng: {
      type: Number,
      default: null,
    },
    accuracy: {
      type: Number,
      default: null,
    },
    capturedAt: {
      type: Date,
      default: null,
    },
    serverTime: {
      type: Date,
      default: Date.now,
    },
    isManualGpsOverride: {
      type: Boolean,
      default: false,
    },
    notes: {
      type: String,
      trim: true,
    },
    photoPurged: {
      type: Boolean,
      default: false,
      index: true,
    },
    photoPurgedAt: {
      type: Date,
      default: null,
    },
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

module.exports = mongoose.model('ToolMovement', toolMovementSchema);
