const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors({
  origin: 'http://localhost:3000', // Your frontend URL
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Import routes
const authRoutes = require('./routes/auth');
const postRoutes = require('./routes/posts');
const postLikesRoutes = require('./routes/postLikesRoutes');
const commentRoutes = require('./routes/comments');
const communityRoutes = require('./routes/communities');

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/post_likes', postLikesRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/communities', communityRoutes);

// Test route
app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend is working!' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Database: ${process.env.DB_NAME}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.log('Unhandled Promise Rejection:', err);
  process.exit(1);
});

module.exports = app;