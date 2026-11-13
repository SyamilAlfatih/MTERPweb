const mongoose = require('mongoose');

const AUDIT_RETENTION_SECONDS = 365 * 24 * 60 * 60; // 1 year (365 days)

/**
 * Immutable append-only AuditLog schema for system-wide compliance and security auditing.
 */
const auditLogSchema = new mongoose.Schema(
  {
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    actorName: {
      type: String,
      default: 'System / Anonymous',
      trim: true,
    },
    actorUsername: {
      type: String,
      default: '',
      trim: true,
    },
    actorRole: {
      type: String,
      default: 'anonymous',
      trim: true,
    },
    action: {
      type: String,
      enum: [
        'CREATE',
        'UPDATE',
        'DELETE',
        'LOGIN',
        'LOGIN_FAILED',
        'LOGOUT',
        'APPROVE',
        'REJECT',
        'RETURN',
        'EXPORT',
        'UPLOAD',
        'OTHER',
      ],
      required: true,
      index: true,
    },
    module: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    entityId: {
      type: String,
      default: '',
      trim: true,
    },
    method: {
      type: String,
      enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      required: true,
    },
    endpoint: {
      type: String,
      required: true,
      trim: true,
    },
    statusCode: {
      type: Number,
      required: true,
    },
    success: {
      type: Boolean,
      required: true,
      index: true,
    },
    summary: {
      type: String,
      required: true,
      trim: true,
    },
    changes: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    ipAddress: {
      type: String,
      default: '',
      trim: true,
    },
    userAgent: {
      type: String,
      default: '',
      trim: true,
    },
    durationMs: {
      type: Number,
      default: 0,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: AUDIT_RETENTION_SECONDS,
    },
  },
  {
    versionKey: false,
  }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ module: 1, createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ success: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);

