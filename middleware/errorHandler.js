const errorHandler = (err, req, res, next) => {
  console.error(err.stack);

  const error = { ...err };
  error.message = err.message;

  // Sequelize validation error
  if (err.name === 'SequelizeValidationError') {
    const message = err.errors.map(e => e.message).join(', ');
    return res.status(400).json({ error: message });
  }

  // Sequelize unique constraint error
  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(400).json({ error: 'Duplicate field value entered' });
  }

  // JWT error
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Invalid token' });
  }

  res.status(error.statusCode || 500).json({
    error: error.message || 'Server Error'
  });
};

module.exports = errorHandler;