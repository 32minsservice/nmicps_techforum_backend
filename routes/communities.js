// routes/communities.js
console.log('Communities routes file is being loaded!');

const express = require('express');
const { body } = require('express-validator');
const {
  getCommunities,
  getCommunityById,
  createCommunity,
  updateCommunity,
  deleteCommunity,
  joinCommunity,
  leaveCommunity,
  getCommunityMembers,
  getUserCommunities
} = require('../controllers/communityController');

console.log('Community controller functions imported:', {
  getCommunities: typeof getCommunities,
  getCommunityById: typeof getCommunityById,
  createCommunity: typeof createCommunity
});

const { authenticateToken, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Validation rules
const createCommunityValidation = [
  body('name')
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('Community name must be between 3 and 100 characters')
    .matches(/^[a-zA-Z0-9\s\-_]+$/)
    .withMessage('Community name can only contain letters, numbers, spaces, hyphens, and underscores')
];

const updateCommunityValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('Community name must be between 3 and 100 characters')
    .matches(/^[a-zA-Z0-9\s\-_]+$/)
    .withMessage('Community name can only contain letters, numbers, spaces, hyphens, and underscores')
];

// Routes with detailed logging
console.log('Setting up community routes...');

router.get('/getCommunities', (req, res, next) => {
  console.log('GET /getCommunities route hit!');
  getCommunities(req, res, next);
});

router.get('/my-communities', authenticateToken, (req, res, next) => {
  console.log('GET /my-communities route hit!');
  getUserCommunities(req, res, next);
});

router.get('/:id', optionalAuth, (req, res, next) => {
  console.log('GET /:id route hit with ID:', req.params.id);
  getCommunityById(req, res, next);
});

router.post('/', authenticateToken, createCommunityValidation, (req, res, next) => {
  console.log('POST / route hit!');
  createCommunity(req, res, next);
});

router.put('/:id', authenticateToken, updateCommunityValidation, (req, res, next) => {
  console.log('PUT /:id route hit with ID:', req.params.id);
  updateCommunity(req, res, next);
});

router.delete('/:id', authenticateToken, (req, res, next) => {
  console.log('DELETE /:id route hit with ID:', req.params.id);
  deleteCommunity(req, res, next);
});

router.post('/:id/join', authenticateToken, (req, res, next) => {
  console.log('POST /:id/join route hit with ID:', req.params.id);
  joinCommunity(req, res, next);
});

router.post('/:id/leave', authenticateToken, (req, res, next) => {
  console.log('POST /:id/leave route hit with ID:', req.params.id);
  leaveCommunity(req, res, next);
});

router.get('/:id/members', (req, res, next) => {
  console.log('GET /:id/members route hit with ID:', req.params.id);
  getCommunityMembers(req, res, next);
});

console.log('All community routes registered successfully!');

module.exports = router;