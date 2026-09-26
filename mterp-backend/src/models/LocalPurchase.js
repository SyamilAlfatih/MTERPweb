const mongoose = require('mongoose');

const localPurchaseSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    rabItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RABItem',
      required: true,
      index: true,
    },
    voucherNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    }, // e.g. "KW-001/SWK/2026"
    purchaserName: {
      type: String,
      required: true,
      trim: true,
    },
    supplierName: {
      type: String,
      required: true,
      trim: true,
    },
    itemDescription: {
      type: String,
      required: true,
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0.01,
    },
    unitOfMeasure: {
      type: String,
      default: 'PCS',
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    totalPrice: {
      type: Number,
      required: true,
    },
    receiptPhotoUrl: {
      type: String,
      required: true,
    },
    geotagLocation: {
      lat: { type: Number },
      lng: { type: Number },
      addressText: { type: String },
    },
    status: {
      type: String,
      enum: ['DRAFT', 'SUBMITTED', 'VERIFIED', 'REJECTED'],
      default: 'SUBMITTED',
      index: true,
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    verifiedAt: {
      type: Date,
    },
    rejectionReason: String,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

localPurchaseSchema.pre('validate', function (next) {
  if (this.quantity !== undefined && this.unitPrice !== undefined) {
    this.totalPrice = Number(this.quantity) * Number(this.unitPrice);
  }
  next();
});

localPurchaseSchema.index({ projectId: 1, status: 1 });
localPurchaseSchema.index({ projectId: 1, createdAt: -1 });

module.exports = mongoose.model('LocalPurchase', localPurchaseSchema);
