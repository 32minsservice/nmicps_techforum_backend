// controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const pool = require('../config/database');

// Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    {
      userId: user.id,
      role: user.role      // ✅ include role
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};


// Register new user
const register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { username, email, password, role } = req.body;
    const lowerEmail = email.toLowerCase();

    // Validate role
    const allowedRoles = ["user", "moderator"];
    const finalRole = allowedRoles.includes(role) ? role : "user";

    // Check duplicate email
    const emailCheck = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [lowerEmail]
    );
    if (emailCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Check duplicate username
    const usernameCheck = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );
    if (usernameCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Username is already taken'
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // ✅ INSERT ROLE
    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, email, role, created_at`,
      [username, lowerEmail, passwordHash, finalRole]
    );

    const user = result.rows[0];
    const token = generateToken(user);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: { token, user }
    });

  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during registration'
    });
  }
};


// Login user
const login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;
    const lowerEmail = email.toLowerCase();

    // Find user by email
    const result = await pool.query(
      'SELECT id, username, email, password_hash, role, profile_image, created_at FROM users WHERE email = $1',
      [lowerEmail]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const user = result.rows[0];

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const token = generateToken(user);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          profile_image: user.profile_image,
          created_at: user.created_at
        }
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
};

// Get current user profile
const getProfile = async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query(
      'SELECT id, username, email, profile_image, role, created_at FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: {
        user: result.rows[0]
      }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching profile'
    });
  }
};

// Update user profile
const updateProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { username } = req.body;

    if (username) {
      const existingUser = await pool.query(
        'SELECT id FROM users WHERE username = $1 AND id != $2',
        [username, userId]
      );
      if (existingUser.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Username is already taken'
        });
      }
    }

    const result = await pool.query(
      `UPDATE users 
       SET username = COALESCE($1, username), 
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING id, username, email, profile_image, created_at, updated_at`,
      [username, userId]
    );

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: result.rows[0]
      }
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating profile'
    });
  }
};

// Logout
const logout = (req, res) => {
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
};

// controllers/auth.controller.js
const checkUserExists = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email required" });
    }

    const lowerEmail = email.toLowerCase();

    const result = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [lowerEmail]
    );

    return res.status(200).json({
      exists: result.rows.length > 0,
    });
  } catch (error) {
    console.error("Check user error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};


module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  logout,
  checkUserExists
};
