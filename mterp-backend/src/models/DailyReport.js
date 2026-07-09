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
    volumeCompleted: { type: Number, default: 0 },
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
  photos: [{
    path: { type: String, required: true },
    altText: { type: String, default: '' },
  }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
});

// Backward compatibility: normalize legacy photos stored as plain strings
// into { path, altText } objects after any find/findOne query
function normalizePhotos(doc) {
  if (doc && doc.photos && doc.photos.length > 0) {
    doc.photos = doc.photos.map(p => {
      if (typeof p === 'string') return { path: p, altText: '' };
      if (p && typeof p.path === 'undefined' && typeof p === 'object') {
        // Handle edge case: Mongoose mixed subdocument
        return { path: String(p), altText: '' };
      }
      return p;
    });
  }
}

dailyReportSchema.post('init', normalizePhotos);

// Indexes for efficient queries
dailyReportSchema.index({ projectId: 1, date: -1 });
dailyReportSchema.index({ date: -1 });

module.exports = mongoose.model('DailyReport', dailyReportSchema);
