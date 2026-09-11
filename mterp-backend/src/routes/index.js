const authRoutes = require('./auth');
const projectRoutes = require('./projects');
const requestRoutes = require('./requests');
const toolRoutes = require('./tools');
const attendanceRoutes = require('./attendance');
const kasbonRoutes = require('./kasbon');
const taskRoutes = require('./tasks');
const slipGajiRoutes = require('./slipgaji');
const userRoutes = require('./users');
const attendanceSessionRoutes = require('./attendanceSession');
const pekerjaRoutes = require('./pekerja');
const apiKeyRoutes = require('./apikeys');

module.exports = {
  authRoutes,
  projectRoutes,
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
};
