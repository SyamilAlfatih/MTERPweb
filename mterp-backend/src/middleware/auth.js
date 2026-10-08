const jwt = require('jsonwebtoken');
const { User } = require('../models');

// Verify JWT token middleware
const auth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ msg: 'No token, authorization denied' });
    }
    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Attach decoded payload directly instead of querying DB
    req.user = { _id: decoded.userId, role: decoded.role }; 
    req.token = token;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error.message);
    res.status(401).json({ msg: 'Token is not valid' });
  }
};

// Role-based access control middleware
const roleHierarchy = {
  owner: ['owner', 'director', 'president_director', 'operational_director', 'admin', 'admin_project', 'supervisor', 'site_manager'],
  director: ['director', 'president_director', 'operational_director', 'owner'],
  project_manager: ['project_manager', 'site_manager', 'director', 'operational_director', 'president_director', 'owner'],
  supervisor: ['supervisor', 'site_manager', 'admin_project', 'foreman', 'owner'],
  finance: ['finance', 'admin_project', 'director', 'operational_director', 'president_director', 'owner'],
  admin: ['admin', 'admin_project', 'owner']
};

const authorize = (...roles) => {
  return (req, res, next) => {
    const userRole = (req.user?.role || '').toLowerCase();
    
    // Owner always has universal system access
    if (userRole === 'owner') {
      return next();
    }

    let expandedRoles = new Set(roles.map(r => r.toLowerCase()));

    roles.forEach(role => {
      const lowerRole = role.toLowerCase();
      if (roleHierarchy[lowerRole]) {
        roleHierarchy[lowerRole].forEach(r => expandedRoles.add(r.toLowerCase()));
      }
    });

    if (!expandedRoles.has(userRole)) {
      return res.status(403).json({ msg: 'Access denied. Insufficient permissions.' });
    }
    next();
  };
};

// Optional auth - doesn't fail if no token
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = { _id: decoded.userId, role: decoded.role }; 
      req.token = token;
    }
    next();
  } catch (error) {
    // Continue without auth
    next();
  }
};

module.exports = { auth, authorize, optionalAuth };
