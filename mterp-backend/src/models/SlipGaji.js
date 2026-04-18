const mongoose = require('mongoose');

const slipGajiSchema = new mongoose.Schema({
    slipNumber: {
        type: String,
        required: true,
        unique: true,
    },
    workerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    period: {
        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true },
    },
    attendanceSummary: {
        totalDays: { type: Number, default: 0 },
        presentDays: { type: Number, default: 0 },
        lateDays: { type: Number, default: 0 },
        absentDays: { type: Number, default: 0 },
        permitDays: { type: Number, default: 0 },
        totalHours: { type: Number, default: 0 },
        totalOvertimeHours: { type: Number, default: 0 },
    },
    earnings: {
        dailyRate: { type: Number, default: 0 },
        totalDailyWage: { type: Number, default: 0 },
        totalOvertime: { type: Number, default: 0 },
        bonus: { type: Number, default: 0 },
        deductions: { type: Number, default: 0 },
        kasbonDeduction: { type: Number, default: 0 },
        netPay: { type: Number, default: 0 },
    },
    workerPaymentInfo: {
        bankAccount: { type: String, default: '' },
        bankPlatform: { type: String, default: '' },
        accountName: { type: String, default: '' },
    },
    authorization: {
        directorPassphrase: { type: String, default: '' }, // hashed
        directorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        directorName: { type: String, default: '' },
        directorSignedAt: Date,
        ownerPassphrase: { type: String, default: '' }, // hashed
        ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        ownerName: { type: String, default: '' },
        ownerSignedAt: Date,
    },
    status: {
        type: String,
        enum: ['draft', 'authorized', 'issued'],
        default: 'draft',
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    notes: { type: String, default: '' },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

slipGajiSchema.index({ workerId: 1, 'period.startDate': 1, 'period.endDate': 1 }, { unique: true });

module.exports = mongoose.model('SlipGaji', slipGajiSchema);
