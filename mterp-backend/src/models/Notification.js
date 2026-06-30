const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: [
      'task_assigned',
      'task_completed',
      'request_approved',
      'request_rejected',
      'kasbon_approved',
      'kasbon_rejected',
      'daily_report',
      'project_created',
      'report_approved',
      'attendance_permit',
      'general',
    ],
    default: 'general',
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  message: {
    type: String,
    required: true,
    trim: true,
  },
  data: {
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
    requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Request' },
    kasbonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Kasbon' },
    reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectReport' },
  },
  isRead: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Compound index for efficient querying: unread first, newest first
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

// TTL index: auto-delete notifications after 30 days
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

module.exports = mongoose.model('Notification', notificationSchema);
