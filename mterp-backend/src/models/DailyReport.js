const mongoose = require('mongoose');

const dailyReportSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
  },
  date: { type: Date, required: true },
  progressPercent: { type: Number, default: 0 },
  workItemUpdates: [{
    workItemId: { type: mongoose.Schema.Types.ObjectId },
    name: String,
    previousProgress: { type: Number, default: 0 },
    newProgress: { type: Number, default: 0 },
    actualCost: { type: Number, default: 0 },
  }],
  supplyUpdates: [{
    supplyId: { type: mongoose.Schema.Types.ObjectId },
    item: String,
    previousStatus: String,
    newStatus: String,
    actualCost: { type: Number, default: 0 },
  }],
  weather: { type: String, default: 'Cerah' },
  materials: String,
  workforce: String,
  notes: String,
  photos: [String],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
});

// Indexes for efficient queries
dailyReportSchema.index({ projectId: 1, date: -1 });
dailyReportSchema.index({ date: -1 });

module.exports = mongoose.model('DailyReport', dailyReportSchema);
