    const { body, param, validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

const registerValidation = [
  body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  validate
];

const loginValidation = [
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('password').notEmpty().withMessage('Password is required'),
  validate
];

const createCommunityValidation = [
  body('name').trim().notEmpty().withMessage('Community name is required'),
  validate
];

const createPostValidation = [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('body').trim().notEmpty().withMessage('Body is required'),
  body('community_id').isInt().withMessage('Valid community ID is required'),
  validate
];

const createCommentValidation = [
  body('body').trim().notEmpty().withMessage('Comment body is required'),
  validate
];

module.exports = {
  registerValidation,
  loginValidation,
  createCommunityValidation,
  createPostValidation,
  createCommentValidation
};