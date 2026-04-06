const express = require('express');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { User } = require('../models');
const { auth } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// Generate JWT token
const generateToken = (userId, role) => {
  return jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

// Generate OTP
const generateOTP = () => {
  return crypto.randomInt(100000, 1000000).toString();
};

// Email transporter (configure in production)
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: process.env.EMAIL_PORT || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, fullName, role } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    });

    if (existingUser) {
      return res.status(400).json({ msg: 'User already exists' });
    }

    // Generate OTP
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Create user
    const user = new User({
      username,
      email,
      password,
      fullName,
      role: role || 'worker',
      otp: {
        code: otp,
        expiresAt: otpExpiry,
      },
    });

    await user.save();

    // Send OTP email (in production)
    if (process.env.EMAIL_USER) {
      transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'MTERP - Verifikasi Email',
        html: `
          <h2>Verifikasi Email MTERP</h2>
          <p>Kode OTP Anda: <strong>${otp}</strong></p>
          <p>Kode berlaku selama 10 menit.</p>
        `,
      }).catch(emailError => console.log('Email sending failed:', emailError.message));
    }

    res.status(201).json({
      msg: 'Registration successful. Check your email for OTP.',
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/auth/verify
router.post('/verify', async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    if (user.isVerified) {
      return res.status(400).json({ msg: 'User already verified' });
    }

    if (!user.otp || user.otp.code !== otp) {
      return res.status(400).json({ msg: 'Invalid OTP' });
    }

    if (new Date() > user.otp.expiresAt) {
      return res.status(400).json({ msg: 'OTP expired' });
    }

    // Verify user
    user.isVerified = true;
    user.otp = undefined;
    await user.save();

    res.json({ msg: 'Email verified successfully' });
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Find user by username or email
    const user = await User.findOne({
      $or: [{ username }, { email: username }]
    });

    if (!user) {
      return res.status(401).json({ msg: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ msg: 'Invalid credentials' });
    }

    // Check if email is verified
    if (!user.isVerified) {
      return res.status(401).json({ msg: 'Please verify your email first' });
    }

    // Generate token
    const token = generateToken(user._id, user.role);

    res.json({
      ...user.toJSON(),
      token,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/auth/me - Get current user
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ msg: 'No token' });
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    res.status(401).json({ msg: 'Invalid token' });
  }
});

// PUT /api/auth/profile - Update user profile
router.put('/profile', auth, async (req, res) => {
  try {
    const { fullName, email, phone, address, paymentInfo } = req.body;

    const updateData = {};
    if (fullName) updateData.fullName = fullName;
    if (email) updateData.email = email;
    if (phone) updateData.phone = phone;
    if (address) updateData.address = address;
    if (paymentInfo) {
      if (paymentInfo.bankAccount !== undefined) updateData['paymentInfo.bankAccount'] = paymentInfo.bankAccount;
      if (paymentInfo.bankPlatform !== undefined) updateData['paymentInfo.bankPlatform'] = paymentInfo.bankPlatform;
      if (paymentInfo.accountName !== undefined) updateData['paymentInfo.accountName'] = paymentInfo.accountName;
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updateData },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/auth/profile/photo - Update profile photo
router.put('/profile/photo', auth, uploadLimiter, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ msg: 'No photo uploaded' });
    }

    const photoUrl = req.file.path;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { profileImage: photoUrl } },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Update photo error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /api/auth/profile/photo - Remove profile photo
router.delete('/profile/photo', auth, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $unset: { profileImage: 1 } },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Delete photo error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;

