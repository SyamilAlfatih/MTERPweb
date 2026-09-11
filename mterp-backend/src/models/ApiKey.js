const mongoose = require('mongoose');

const apiKeySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  keyHash: {
    type: String,
    required: true,
  },
  keyPrefix: {
    type: String,
    required: true,
    trim: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  lastUsedAt: {
    type: Date,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('ApiKey', apiKeySchema);
