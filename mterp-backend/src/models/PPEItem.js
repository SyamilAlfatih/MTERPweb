const mongoose = require('mongoose');

const ppeItemSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    category: {
      type: String,
      required: true,
      enum: [
        'head_protection',
        'foot_leg_protection',
        'fall_protection',
        'eye_face_protection',
        'hand_arm_protection',
        'respiratory_protection',
        'hearing_protection',
        'body_protective_clothing',
        'other',
      ],
      default: 'head_protection',
      index: true,
    },
    categoryLabel: {
      type: String,
      trim: true,
      default: 'Alat Pelindung Diri (APD)',
    },
    brand: {
      type: String,
      trim: true,
      default: '',
    },
    modelNumber: {
      type: String,
      trim: true,
      default: '',
    },
    totalQty: {
      type: Number,
      required: true,
      default: 1,
      min: 0,
    },
    availableQty: {
      type: Number,
      required: true,
      default: 1,
      min: 0,
    },
    inUseQty: {
      type: Number,
      default: 0,
      min: 0,
    },
    damagedQty: {
      type: Number,
      default: 0,
      min: 0,
    },
    unit: {
      type: String,
      trim: true,
      default: 'Unit',
    },
    condition: {
      type: String,
      enum: ['Baik', 'Cukup Baik', 'Perlu Servis', 'Rusak / Afkir'],
      default: 'Baik',
      index: true,
    },
    warehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
      default: null,
      index: true,
    },
    binRef: {
      type: String,
      trim: true,
      default: '',
    },
    location: {
      type: String,
      trim: true,
      default: 'Head Office PT Mega Tama Enerco',
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'disposed'],
      default: 'active',
      index: true,
    },
    photo: {
      type: String,
      default: null,
    },
    templateId: {
      type: String,
      default: null,
      index: true,
    },
    standardRegulation: {
      indonesian: {
        type: String,
        trim: true,
        default: 'Permenakertrans No. PER.08/MEN/VII/2010; UU No. 1/1970',
      },
      international: {
        type: String,
        trim: true,
        default: 'OSHA 29 CFR 1926; ANSI / EN / ISO Standards',
      },
      riskLevel: {
        type: String,
        enum: ['Rendah', 'Sedang', 'Tinggi', 'Kritis', 'Sangat Kritis'],
        default: 'Kritis',
      },
      colorCode: {
        type: String,
        trim: true,
        default: '',
      },
      mandatoryZones: {
        type: String,
        trim: true,
        default: 'Seluruh area kerja operasional konstruksi aktif',
      },
    },
    guide: {
      description: {
        type: String,
        trim: true,
        default: '',
      },
      preUseInspection: {
        type: [String],
        default: [],
      },
      wearingSteps: {
        type: [String],
        default: [],
      },
      maintenance: {
        type: [String],
        default: [],
      },
      dosAndDonts: {
        dos: {
          type: [String],
          default: [],
        },
        donts: {
          type: [String],
          default: [],
        },
      },
      expiryYears: {
        type: Number,
        default: 5,
        min: 1,
      },
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes
ppeItemSchema.index({ status: 1, category: 1 });
ppeItemSchema.index({ projectId: 1, status: 1 });

module.exports = mongoose.model('PPEItem', ppeItemSchema);

