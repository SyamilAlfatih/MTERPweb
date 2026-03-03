const mongoose = require('mongoose');

const workItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  qty: { type: Number, default: 0 },
  volume: { type: String, default: 'M2' },
  unit: { type: String, default: 'M2' },
  cost: { type: Number, default: 0 },
  progress: { type: Number, default: 0 },
  actualCost: { type: Number, default: 0 },
  startDate: Date,
  endDate: Date,
});

const projectSchema = new mongoose.Schema({
  nama: {
    type: String,
    required: true,
    trim: true,
  },
  lokasi: {
    type: String,
    required: true,
    trim: true,
  },
  description: String,
  totalBudget: {
    type: Number,
    default: 0,
  },
  progress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  status: {
    type: String,
    enum: ['Planning', 'In Progress', 'Completed', 'On Hold'],
    default: 'Planning',
  },
  startDate: Date,
  endDate: Date,

  // Documents
  documents: {
    shopDrawing: String,
    hse: String,
    manPowerList: String,
    materialList: String,
  },

  // Work items stay embedded (bounded, always loaded with project)
  workItems: [workItemSchema],

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  assignedTo: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],

  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Calculate progress from work items + supplies (passed as parameter)
// supplies are now in a separate collection, so they must be passed in
projectSchema.methods.calculateProgress = function (supplies) {
  const workItems = this.workItems || [];
  const supplyList = supplies || [];

  if (workItems.length === 0 && supplyList.length === 0) return 0;

  // Map supply status to progress percentage
  const supplyStatusProgress = { 'Pending': 0, 'Ordered': 50, 'Delivered': 100 };

  // Combine all items into a unified cost-weighted list
  const allItems = [];

  for (const item of workItems) {
    allItems.push({ cost: item.cost || 0, progress: item.progress || 0 });
  }
  for (const supply of supplyList) {
    allItems.push({ cost: supply.cost || 0, progress: supplyStatusProgress[supply.status] || 0 });
  }

  const totalCost = allItems.reduce((s, i) => s + i.cost, 0);

  if (totalCost === 0) {
    // Fallback to simple average if no costs defined
    const totalProgress = allItems.reduce((s, i) => s + i.progress, 0);
    return Math.round(totalProgress / allItems.length);
  }

  const weightedProgress = allItems.reduce((s, i) => {
    const weight = i.cost / totalCost;
    return s + weight * i.progress;
  }, 0);

  return Math.round(weightedProgress);
};

// Update timestamps
projectSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

projectSchema.pre('findOneAndUpdate', function (next) {
  this.set({ updatedAt: new Date() });
  next();
});

module.exports = mongoose.model('Project', projectSchema);
