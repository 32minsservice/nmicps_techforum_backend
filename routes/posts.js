const express = require('express');
const { body } = require('express-validator');
const { 
  getPosts, 
  getPostById, 
  createPost, 
  updatePost, 
  deletePost, 
  toggleLike,
  getPostsByUser
} = require('../controllers/postController');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { uploadSingle } = require('../middleware/upload');

const router = express.Router();

// Validation rules
const createPostValidation = [
  body('title')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Title is required and must be less than 255 characters'),
  body('body')
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage('Body must be less than 5000 characters'),
  body('community_id')
    .isInt({ min: 1 })
    .withMessage('Valid community ID is required')
];

const updatePostValidation = [
  body('title')
    .optional()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Title must be less than 255 characters'),
  body('body')
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage('Body must be less than 5000 characters')
];

//related to the post routes



// Routes
router.get('/', optionalAuth, getPosts);
router.get('/:id', optionalAuth, getPostById);
router.post('/', authenticateToken, uploadSingle('image'), createPostValidation, createPost);
router.put('/:id', authenticateToken, uploadSingle('image'), updatePostValidation, updatePost);
router.delete('/:id', authenticateToken, deletePost);
router.post('/:id/like', authenticateToken, toggleLike);
router.get('/user/:userId', optionalAuth, getPostsByUser);

// Remove this duplicate route - it's not needed and conflicts with the main GET route
// router.get('/posts', async (req, res) => {
//   try {
//     // db query
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ success: false, message: 'Server error fetching posts' });
//   }
// });

module.exports = router;