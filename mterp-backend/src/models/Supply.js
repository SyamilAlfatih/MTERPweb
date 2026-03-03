const mongoose = require('mongoose');

const supplySchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
  },
  item: { type: String, required: true },
  qty: { type: Number, default: 0 },
  unit: { type: String, default: 'pcs' },
  cost: { type: Number, default: 0 },
  actualCost: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['Pending', 'Ordered', 'Delivered'],
    default: 'Pending',
  },
  deliveryDate: Date,
  startDate: Date,
  endDate: Date,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

supplySchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

supplySchema.pre('findOneAndUpdate', function (next) {
  this.set({ updatedAt: new Date() });
  next();
});

// Indexes for efficient queries
supplySchema.index({ projectId: 1, status: 1 });

module.exports = mongoose.model('Supply', supplySchema);
