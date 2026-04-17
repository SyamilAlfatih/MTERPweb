const mongoose = require('mongoose');

const toolSchema = new mongoose.Schema({
  nama: {
    type: String,
    required: true,
    trim: true,
  },
  kategori: {
    type: String,
    trim: true,
  },
  stok: {
    type: Number,
    default: 0,
    min: 0,
  },
  satuan: {
    type: String,
    default: 'unit',
  },
  kondisi: {
    type: String,
    enum: ['Baik', 'Rusak', 'Maintenance'],
    default: 'Baik',
  },
  lokasi: String,
  qrCode: String,
  photo: String,
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
  },
  lastChecked: Date,
  notes: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

toolSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

toolSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

// Text search index
toolSchema.index({ nama: 'text', kategori: 'text', lokasi: 'text' });

module.exports = mongoose.model('Tool', toolSchema);
