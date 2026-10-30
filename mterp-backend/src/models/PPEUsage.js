const mongoose = require('mongoose');

const ppeUsageSchema = new mongoose.Schema(
  {
    workerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    workerName: {
      type: String,
      trim: true,
      required: true,
    },
    workerRole: {
      type: String,
      trim: true,
      default: 'worker',
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      default: null,
      index: true,
    },
    projectName: {
      type: String,
      trim: true,
      default: '',
    },
    location: {
      type: String,
      trim: true,
      default: '',
    },
    ppeItems: {
      type: [String],
      required: true,
      validate: {
        validator: function (v) {
          return Array.isArray(v) && v.length > 0;
        },
        message: 'Minimal pilih 1 item APD yang digunakan',
      },
    },
    activityType: {
      type: String,
      required: true,
      trim: true,
    },
    borrowedAt: {
      type: Date,
      default: Date.now,
      required: true,
      index: true,
    },
    expectedReturnDate: {
      type: Date,
      default: null,
    },
    returnedAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ['in_use', 'returned', 'overdue', 'maintenance_required'],
      default: 'in_use',
      index: true,
    },
    conditionBefore: {
      type: String,
      default: 'Baik & Layak Pakai',
    },
    conditionAfter: {
      type: String,
      default: 'Belum Dikembalikan',
    },
    inspectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    inspectorName: {
      type: String,
      trim: true,
      default: 'Aam Ramli Permana, S.E (HSE Manager)',
    },
    inspectionChecklist: {
      fitCheck: { type: Boolean, default: true },
      shellStrapsIntact: { type: Boolean, default: true },
      latchLockSecure: { type: Boolean, default: true },
      certifiedStandardChecked: { type: Boolean, default: true },
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    returnNotes: {
      type: String,
      trim: true,
      default: '',
    },
    photo: {
      type: String,
      default: null,
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
        default: '',
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
    returnEvidence: {
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
        default: null,
      },
      isManualGpsOverride: {
        type: Boolean,
        default: false,
      },
      notes: {
        type: String,
        trim: true,
        default: '',
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
    history: [
      {
        action: {
          type: String,
          enum: ['check_out', 'return', 'condition_check', 'note_added'],
          required: true,
        },
        actionLabel: {
          type: String,
          default: '',
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
        byUserId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          default: null,
        },
        byUserName: {
          type: String,
          default: '',
        },
        location: {
          type: String,
          default: '',
        },
        condition: {
          type: String,
          default: '',
        },
        notes: {
          type: String,
          default: '',
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
          isManualGpsOverride: {
            type: Boolean,
            default: false,
          },
          photoPurged: {
            type: Boolean,
            default: false,
          },
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Helpful compound indexes
ppeUsageSchema.index({ status: 1, borrowedAt: -1 });
ppeUsageSchema.index({ workerId: 1, status: 1 });
ppeUsageSchema.index({ projectId: 1, borrowedAt: -1 });

module.exports = mongoose.model('PPEUsage', ppeUsageSchema);

