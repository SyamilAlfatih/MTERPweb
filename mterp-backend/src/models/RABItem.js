const mongoose = require('mongoose');

const rabItemSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    wbsCode: {
      type: String,
      required: true,
      trim: true, // e.g. "1.1.2"
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: ['Material', 'Upah', 'Alat', 'Subkon', 'Lainnya'],
      default: 'Material',
    },
    unitOfMeasure: {
      type: String,
      enum: ['CUM', 'CFT', 'MT', 'SQM', 'MTR', 'KG', 'NOS', 'HOK', 'JAM', 'LS', 'PCS', 'ZAK'],
      required: true,
      uppercase: true,
    },
    budgetedQuantity: {
      type: Number,
      required: true,
      min: 0,
    },
    unitRate: {
      type: Number,
      required: true,
      min: 0,
    },
    totalBudget: {
      type: Number,
      required: true,
      default: 0,
    },
    committedQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    realizedQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    realizedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Auto-calculate total budget prior to validation
rabItemSchema.pre('validate', function (next) {
  if (this.budgetedQuantity !== undefined && this.unitRate !== undefined) {
    this.totalBudget = Number(this.budgetedQuantity) * Number(this.unitRate);
  }
  next();
});

// Compound index to guarantee uniqueness of WBS code per project
rabItemSchema.index({ projectId: 1, wbsCode: 1 }, { unique: true });
rabItemSchema.index({ projectId: 1, category: 1 });

module.exports = mongoose.model('RABItem', rabItemSchema);
