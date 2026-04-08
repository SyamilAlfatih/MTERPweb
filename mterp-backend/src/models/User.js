const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
  },
  fullName: {
    type: String,
    required: true,
    trim: true,
  },
  role: {
    type: String,
    enum: [
      'worker', 'tukang', 'helper',
      'supervisor', 'site_manager', 'foreman',
      'device_admin', 'asset_admin', 'admin_project',
      'director', 'president_director', 'operational_director',
      'owner'
    ],
    default: 'worker',
  },
  position: {
    type: String,
    default: '',
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  otp: {
    code: String,
    expiresAt: Date,
  },
  phone: {
    type: String,
    trim: true,
  },
  address: {
    type: String,
    trim: true,
  },
  profileImage: String,
  paymentInfo: {
    bankAccount: { type: String, trim: true, default: '' },
    bankPlatform: { type: String, trim: true, default: '' },
    accountName: { type: String, trim: true, default: '' },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Remove sensitive fields when converting to JSON
userSchema.methods.toJSON = function () {
  const user = this.toObject();
  delete user.password;
  delete user.otp;
  return user;
};

module.exports = mongoose.model('User', userSchema);
