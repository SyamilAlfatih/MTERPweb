const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
  item: {
    type: String,
    required: true,
    trim: true,
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
  dateNeeded: String,
  purpose: String,
  costEstimate: Number,
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'Delivered'],
    default: 'Pending',
  },
  urgency: {
    type: String,
    enum: ['Low', 'Normal', 'High'],
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
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  rejectionReason: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

requestSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

requestSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

module.exports = mongoose.model('Request', requestSchema);
