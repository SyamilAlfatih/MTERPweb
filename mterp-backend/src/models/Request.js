const mongoose = require('mongoose');

const procurementItemSchema = new mongoose.Schema({
  isRabBased: {
    type: Boolean,
    default: false,
  },
  rabItemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RABItem',
  },
  wbsCode: {
    type: String,
    trim: true,
  },
  item: {
    type: String,
    required: true,
    trim: true,
  },
  specifications: {
    type: String,
    trim: true,
    default: '',
  },
  qty: {
    type: Number,
    required: true,
    min: 0,
  },
  unit: {
    type: String,
    default: 'Pcs',
  },
  budgetUnitRate: {
    type: Number,
    default: 0,
  },
  targetPriceRange: {
    min: { type: Number, default: 0 },
    max: { type: Number, default: 0 },
  },
  totalBudget: {
    type: Number,
    default: 0,
  },

  // PO Sourcing Fields
  poUnitPrice: {
    type: Number,
    default: 0,
  },
  poTotalAmount: {
    type: Number,
    default: 0,
  },

  // Site Receipt Verification Fields
  receivedQty: {
    type: Number,
    default: 0,
  },
  receivedCondition: {
    type: String,
    enum: ['Good', 'Damaged', 'Partial', 'Pending'],
    default: 'Pending',
  },
  itemNotes: {
    type: String,
    default: '',
  },
});

const requestSchema = new mongoose.Schema({
  // Unique Codes
  prNumber: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
  },
  poNumber: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
  },

  // Multi-item Line Array
  items: [procurementItemSchema],
  totalEstimatedBudget: {
    type: Number,
    default: 0,
  },

  // Backward compatibility fields for legacy single-item requests
  item: {
    type: String,
    trim: true,
  },
  qty: {
    type: Number,
    default: 0,
  },
  unit: {
    type: String,
    default: 'Pcs',
  },
  dateNeeded: String,
  purpose: String,
  costEstimate: Number,

  // Status Lifecycle
  status: {
    type: String,
    enum: [
      'Pending',            // Legacy PR_PENDING
      'Approved',           // Legacy PR_APPROVED
      'Rejected',           // Legacy PR_REJECTED
      'PR_PENDING',
      'PR_REVIEWED',
      'PR_APPROVED',
      'PR_REJECTED',
      'PO_PENDING_FINANCE',
      'MUST_PURCHASE',
      'ON_THE_WAY',
      'Delivered',          // Legacy DELIVERED
      'DELIVERED',
      'PAID',
    ],
    default: 'PR_PENDING',
  },
  urgency: {
    type: String,
    enum: ['Low', 'Normal', 'High', 'Urgent'],
    default: 'Normal',
  },
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
  },

  // Legacy approval fields
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  rejectionReason: String,

  // 2-Tier PR Approval
  reviewedBy: {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: String,
    reviewedAt: Date,
    notes: String,
  },
  opsApprovedBy: {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    notes: String,
  },

  // Sourcing & Multi-Supplier Comparison Matrix
  comparisons: [{
    supplierName: { type: String, required: true, trim: true },
    location: { type: String, default: '' },
    contact: { type: String, default: '' },
    itemRates: [{
      itemIndex: Number,
      itemName: String,
      quotedUnitPrice: Number,
      quotedTotalAmount: Number,
    }],
    subtotalItems: { type: Number, default: 0 },
    shippingCost: { type: Number, default: 0 },
    totalLandedCost: { type: Number, default: 0 },
    leadTimeDays: Number,
    paymentTerms: String,
    notes: String,
    isRecommended: { type: Boolean, default: false },
    isPaylater: { type: Boolean, default: false },
    schemeType: {
      type: String,
      enum: ['STANDARD', 'PAYLATER'],
      default: 'STANDARD',
    },
    interestRate: { type: Number, default: 0 },
    settlementTerms: { type: String, default: 'Tempo Setelah GRN Tanpa Bunga' },
  }],
  selectedSupplier: {
    supplierName: String,
    location: String,
    contact: String,
    subtotalItems: Number,
    shippingCost: Number,
    totalLandedCost: Number,
    leadTimeDays: Number,
    paymentTerms: String,
    isPaylater: { type: Boolean, default: false },
    schemeType: {
      type: String,
      enum: ['STANDARD', 'PAYLATER'],
      default: 'STANDARD',
    },
    interestRate: { type: Number, default: 0 },
    settlementTerms: String,
  },
  poSubtotal: { type: Number, default: 0 },
  poShippingCost: { type: Number, default: 0 },
  poTotalAmount: { type: Number, default: 0 },

  // Finance Approval
  financeApprovedBy: {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    notes: String,
  },

  // Configurable Assignment of Reviewers & Approvers
  assignedReviewerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  assignedOpsApproverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  assignedFinanceApproverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },

  // In-Transit Dispatch Evidence
  dispatchInfo: {
    suratJalanPhoto: String,
    supplierNotaPhoto: String,
    driverName: String,
    driverPhone: String,
    vehiclePlate: String,
    dispatchedAt: Date,
    eta: String,
    notes: String,
  },

  // Site Arrival Delivery Proof (Mandatory for DONE)
  deliveryProof: {
    sitePhoto: String,
    overallCondition: { type: String, enum: ['Good', 'Damaged', 'Partial'], default: 'Good' },
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    receivedAt: Date,
    notes: String,
    receiverSignature: String,
    driverSignature: String,
  },

  // Post-GRN Payment Confirmation & Settlement Evidence
  paymentConfirmation: {
    paymentDate: {
      type: Date,
      default: Date.now,
    },
    paymentType: {
      type: String,
      enum: [
        'Full Payment (Lunas)',
        'Down Payment (DP)',
        'Pelunasan Akhir',
        'Termin Proyek',
        'Pelunasan Paylater (Bunga 0%)',
      ],
      default: 'Full Payment (Lunas)',
    },
    paymentMethod: {
      type: String,
      enum: ['Bank Transfer', 'Kas Tunai Proyek', 'Giro / Cek', 'Kasbon Settlement', 'Lainnya'],
      default: 'Bank Transfer',
    },
    amountPaid: {
      type: Number,
      default: 0,
    },
    principalAmount: {
      type: Number,
      default: 0,
    },
    interestRate: {
      type: Number,
      default: 0,
    },
    interestAmount: {
      type: Number,
      default: 0,
    },
    sourceAccount: {
      type: String,
      trim: true,
      default: '',
    },
    targetAccount: {
      type: String,
      trim: true,
      default: '',
    },
    targetAccountName: {
      type: String,
      trim: true,
      default: '',
    },
    referenceNumber: {
      type: String,
      trim: true,
      default: '',
    },
    notes: {
      type: String,
      default: '',
    },
    bonPembayaranUrl: {
      type: String,
      default: '',
    },
    transferReceiptUrl: {
      type: String,
      default: '',
    },
    invoiceDocUrl: {
      type: String,
      default: '',
    },
    additionalEvidences: [{
      fileUrl: String,
      fileName: String,
    }],
    confirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    confirmedAt: {
      type: Date,
      default: Date.now,
    },
    payerSignature: {
      type: String,
      default: '',
    },
    schemeApplied: {
      type: String,
      enum: ['STANDARD', 'PAYLATER'],
      default: 'STANDARD',
    },
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

// Auto-sync items and legacy single-item fields
requestSchema.pre('validate', function(next) {
  // If items exist, sync legacy header fields
  if (this.items && this.items.length > 0) {
    if (!this.item) {
      this.item = this.items.map(i => i.item).join(', ');
    }
    const totalQ = this.items.reduce((acc, i) => acc + (Number(i.qty) || 0), 0);
    if (!this.qty) this.qty = totalQ;
    const totalCost = this.items.reduce((acc, i) => acc + (Number(i.totalBudget) || (Number(i.qty) * Number(i.budgetUnitRate)) || 0), 0);
    this.totalEstimatedBudget = totalCost;
    if (!this.costEstimate) this.costEstimate = totalCost;
  } else if (this.item) {
    // If only legacy item provided, seed items array with 1 line item
    this.items = [{
      item: this.item,
      specifications: '',
      qty: this.qty || 1,
      unit: this.unit || 'Pcs',
      budgetUnitRate: this.costEstimate ? (this.costEstimate / (this.qty || 1)) : 0,
      totalBudget: this.costEstimate || 0,
    }];
    this.totalEstimatedBudget = this.costEstimate || 0;
  }

  next();
});

requestSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

requestSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

// Indexes for high performance querying
requestSchema.index({ projectId: 1, status: 1 });
requestSchema.index({ requestedBy: 1, createdAt: -1 });

module.exports = mongoose.model('Request', requestSchema);
