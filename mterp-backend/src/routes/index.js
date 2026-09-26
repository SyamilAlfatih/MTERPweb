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
const projectPlanRoutes = require('./projectPlan');
const rabRoutes = require('./rab');
const localPurchaseRoutes = require('./localPurchases');

module.exports = {
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
};

