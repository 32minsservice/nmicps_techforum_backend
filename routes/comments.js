// routes/comments.js
const express = require('express');
const { body } = require('express-validator');
const {
  getComments,
  createComment,
  updateComment,
  deleteComment,
  toggleLike,
  getCommentsByUser
} = require('../controllers/commentController');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Validation rules
const commentValidation = [
  body('body')
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Comment must be between 1 and 1000 characters'),
  body('parent_comment_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Parent comment ID must be a positive integer')
];

// Comment routes
// Get comments for a post
router.get('/post/:postId', optionalAuth, getComments);

// Create a new comment
router.post('/post/:postId', authenticateToken, commentValidation, createComment);

// Update a comment
router.put('/:id', authenticateToken, commentValidation, updateComment);

// Delete a comment
router.delete('/:id', authenticateToken, deleteComment);

// Toggle like/unlike a comment
router.post('/:id/like', authenticateToken, toggleLike);

// Get comments by user
router.get('/user/:userId', optionalAuth, getCommentsByUser);

module.exports = router;