require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const { authLimiter } = require('./middleware/rateLimiter');

// Import routes
const {
  authRoutes,
  projectRoutes,
  requestRoutes,
  toolRoutes,
  attendanceRoutes,
  kasbonRoutes,
  taskRoutes,
  slipGajiRoutes,
  userRoutes,
} = require('./routes');
const updatesRoutes = require('./routes/updates');
const dashboardRoutes = require('./routes/dashboard');

const app = express();

app.set('trust proxy', 1);

// Middleware
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
  : ['http://localhost:5173', 'http://localhost:3000'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/tools', toolRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/kasbon', kasbonRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/slipgaji', slipGajiRoutes);
app.use('/api/updates', updatesRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/users', userRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.message);

  if (err.name === 'ValidationError') {
    return res.status(400).json({ msg: err.message });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({ msg: 'Invalid ID format' });
  }

  if (err.code === 11000) {
    return res.status(400).json({ msg: 'Duplicate entry' });
  }

  res.status(500).json({ msg: 'Server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ msg: 'Route not found' });
});


// Database connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mterp';
const PORT = process.env.PORT || 3001;

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB');
    console.log(`   Database: ${mongoose.connection.name}`);

    app.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`   API: http://localhost:${PORT}/api`);
      console.log(`   Health: http://localhost:${PORT}/api/health`);
      console.log(`   Allowed Origins: ${allowedOrigins.join(', ')}`);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await mongoose.connection.close();
  process.exit(0);
});

module.exports = app;
