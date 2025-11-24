// middleware/auth.js
const jwt = require('jsonwebtoken');
const pool = require('../config/database');

// Required authentication
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Verify user still exists
    const userResult = await pool.query('SELECT id, username, email FROM users WHERE id = $1', [decoded.userId]);
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    req.user = {
      userId: decoded.userId,
      username: userResult.rows[0].username,
      email: userResult.rows[0].email
    };
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(403).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
};

// Optional authentication - doesn't fail if no token
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      req.user = null;
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Verify user still exists
    const userResult = await pool.query('SELECT id, username, email FROM users WHERE id = $1', [decoded.userId]);
    
    if (userResult.rows.length === 0) {
      req.user = null;
      return next();
    }

    req.user = {
      userId: decoded.userId,
      username: userResult.rows[0].username,
      email: userResult.rows[0].email
    };
    
    next();
  } catch (error) {
    // If token is invalid, just continue without user
    req.user = null;
    next();
  }
};

module.exports = {
  authenticateToken,
  optionalAuth
};