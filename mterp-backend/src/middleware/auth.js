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
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({ msg: 'User not found' });
    }

    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error.message);
    res.status(401).json({ msg: 'Token is not valid' });
  }
};

// Role-based access control middleware
const authorize = (...roles) => {
  return (req, res, next) => {
    let expandedRoles = new Set(roles);

    // Expand equivalent/higher roles based on new role hierarchy
    if (roles.includes('director')) {
      expandedRoles.add('president_director');
      expandedRoles.add('operational_director');
    }

    if (roles.includes('supervisor')) {
      expandedRoles.add('site_manager');
      expandedRoles.add('admin_project');
    }

    if (roles.includes('admin')) {
      expandedRoles.add('admin_project');
    }

    if (!Array.from(expandedRoles).includes(req.user.role)) {
      return res.status(403).json({ 
        msg: 'Access denied. Insufficient permissions.' 
      });
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
      const user = await User.findById(decoded.userId);
      if (user) {
        req.user = user;
        req.token = token;
      }
    }
    next();
  } catch (error) {
    // Continue without auth
    next();
  }
};

module.exports = { auth, authorize, optionalAuth };
