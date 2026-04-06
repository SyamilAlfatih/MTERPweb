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
  director: ['director', 'president_director', 'operational_director'],
  supervisor: ['supervisor', 'site_manager', 'admin_project'],
  admin: ['admin', 'admin_project']
};

const authorize = (...roles) => {
  return (req, res, next) => {
    let expandedRoles = new Set(roles);

    roles.forEach(role => {
      if (roleHierarchy[role]) {
        roleHierarchy[role].forEach(r => expandedRoles.add(r));
      }
    });

    if (!Array.from(expandedRoles).includes(req.user.role)) {
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
