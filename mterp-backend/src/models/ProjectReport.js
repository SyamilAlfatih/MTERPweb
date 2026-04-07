const mongoose = require('mongoose');

const projectReportSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
    index: true,
  },
  reportType: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'custom'],
    required: true,
  },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  dailyReportIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DailyReport',
  }],
  status: {
    type: String,
    enum: ['pending', 'approved'],
    default: 'pending',
  },
  authorization: {
    directorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    directorName: { type: String, default: '' },
    directorPassphrase: { type: String, default: '' },
    directorSignedAt: Date,
  },
  submittedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

projectReportSchema.index({ projectId: 1, startDate: -1 });
projectReportSchema.index({ status: 1 });

module.exports = mongoose.model('ProjectReport', projectReportSchema);
