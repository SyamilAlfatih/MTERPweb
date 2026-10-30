process.env.TZ = 'Asia/Jakarta';
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const http = require('http');
const express = require('express');
let compression = null;
try {
  compression = require('compression');
} catch (err) {
  console.warn('⚠️ [server] compression package not found; running without compression middleware until npm install is executed');
}
const mongoose = require('mongoose');
const cors = require('cors');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { authLimiter } = require('./middleware/rateLimiter');

// Import routes
const {
  authRoutes,
  projectRoutes,
  projectPlanRoutes,
  requestRoutes,
  toolRoutes,
  attendanceRoutes,
  kasbonRoutes,
  taskRoutes,
  slipGajiRoutes,
  userRoutes,
  attendanceSessionRoutes,
  pekerjaRoutes,
  apiKeyRoutes,
  rabRoutes,
  localPurchaseRoutes,
  spklRoutes,
  approvalConfigRoutes,
  warehouseRoutes,
  ppeUsageRoutes,
  ppeItemRoutes,
} = require('./routes');
const updatesRoutes = require('./routes/updates');
const dashboardRoutes = require('./routes/dashboard');
const notificationRoutes = require('./routes/notifications');
const { setIO } = require('./utils/notify');

const app = express();
const server = http.createServer(app);

app.set('trust proxy', 1);

// Universal CORS and static file serving for uploaded files
const uploadsBaseDir = path.join(__dirname, '../uploads');

app.use('/uploads', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range');
  res.header('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type, Content-Disposition');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
}, express.static(uploadsBaseDir, {
  setHeaders: (res, filePath) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    if (filePath.toLowerCase().endsWith('.pdf')) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline');
    }
  }
}), (req, res, next) => {
  // Resilient fallback: If file was saved under a different subfolder (e.g. misc/ vs photos/ vs documents/)
  const requestedFile = path.basename(req.path);
  if (!requestedFile || requestedFile === '.' || requestedFile === '/') {
    return next();
  }
  const subDirs = ['misc', 'photos', 'documents', 'attendance-sessions'];
  for (const dir of subDirs) {
    const candidate = path.join(uploadsBaseDir, dir, requestedFile);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return res.sendFile(candidate);
    }
  }
  next();
});

// API Middleware
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
  : ['http://localhost:5173', 'http://localhost:3000'];

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  // Allow any localhost or 127.0.0.1 port in development
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return false;
};

if (compression) {
  app.use(compression());
}

app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/projects/:projectId/plan', projectPlanRoutes);
app.use('/api/projects/:projectId/rab', rabRoutes);
app.use('/api/rab', rabRoutes);
app.use('/api/projects/:projectId/local-purchases', localPurchaseRoutes);
app.use('/api/local-purchases', localPurchaseRoutes);
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
app.use('/api/pekerja', pekerjaRoutes);
app.use('/api/apikeys', apiKeyRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/attendance-session', attendanceSessionRoutes);
app.use('/api/spkl', spklRoutes);
app.use('/api/approval-config', approvalConfigRoutes);
app.use('/api/warehouses', warehouseRoutes);
app.use('/api/ppe-usages', ppeUsageRoutes);
app.use('/api/ppe', ppeUsageRoutes);
app.use('/api/ppe-items', ppeItemRoutes);

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

    // Audit & synchronize project progress asynchronously in background if not disabled
    if (process.env.SYNC_ON_BOOT !== 'false') {
      setTimeout(() => {
        const { syncAllProjectsProgress } = require('./utils/projectProgress');
        syncAllProjectsProgress()
          .then(synced => {
            if (synced && synced.length > 0) {
              console.log(`📊 Synchronized progress for ${synced.length} projects`);
            }
          })
          .catch(err => console.error('⚠️ Project progress sync warning:', err.message));
      }, 3000);
    }

    // Socket.io setup
    const io = new Server(server, {
      cors: {
        origin: (origin, callback) => {
          if (isAllowedOrigin(origin)) {
            callback(null, true);
          } else {
            callback(new Error('Not allowed by CORS'));
          }
        },
        credentials: true,
      },
    });

    // Socket.io JWT authentication middleware
    io.use((socket, next) => {
      const token = socket.handshake.auth?.token;
      if (!token) {
        return next(new Error('Authentication required'));
      }
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.userId;
        socket.userRole = decoded.role;
        next();
      } catch (err) {
        return next(new Error('Invalid token'));
      }
    });

    // Socket.io connection handler
    io.on('connection', (socket) => {
      // Each user joins a room identified by their userId
      socket.join(socket.userId);
      console.log(`🔌 Socket connected: ${socket.userId}`);

      socket.on('disconnect', () => {
        console.log(`🔌 Socket disconnected: ${socket.userId}`);
      });
    });

    // Wire up the notify utility with the io instance
    setIO(io);

    server.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`   API: http://localhost:${PORT}/api`);
      console.log(`   WebSocket: ws://localhost:${PORT}`);
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
