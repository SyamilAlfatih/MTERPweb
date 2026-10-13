const mongoose = require('mongoose');

const SPKLConfigSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'global', unique: true, index: true },
    defaultSupervisorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    defaultPmId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    defaultFinanceId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    autoAssignEnabled: { type: Boolean, default: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SPKLConfig', SPKLConfigSchema);
