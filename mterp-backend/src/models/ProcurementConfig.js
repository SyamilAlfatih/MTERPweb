const mongoose = require('mongoose');

const ProcurementConfigSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'global', unique: true, index: true },
    defaultReviewerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    defaultOpsApproverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    defaultFinanceApproverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    autoAssignEnabled: { type: Boolean, default: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ProcurementConfig', ProcurementConfigSchema);
