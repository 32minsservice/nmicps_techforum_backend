const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Import routes with console logs to debug
console.log('Loading routes...');
const authRoutes = require('./routes/auth');
const postRoutes = require('./routes/posts');
const postLikesRoutes = require('./routes/postLikesRoutes');
const commentRoutes = require('./routes/comments'); // Make sure this file exists
const communityRoutes = require('./routes/communities');

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/post_likes', postLikesRoutes);
app.use('/api/comments', commentRoutes); // Fixed: Mount comment routes
app.use('/api/communities', communityRoutes);

console.log('All routes mounted successfully');

// Test route
app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend is working!' });
});

// Add a route to list all registered routes (for debugging)
app.get('/api/routes', (req, res) => {
  const routes = [];
  
  function extractRoutes(stack, basePath = '') {
    stack.forEach((layer) => {
      if (layer.route) {
        // Direct route
        routes.push({
          path: basePath + layer.route.path,
          methods: Object.keys(layer.route.methods)
        });
      } else if (layer.name === 'router' && layer.handle.stack) {
        // Router middleware
        const routerBasePath = layer.regexp.source
          .replace('^\\/api\\/([^\\/]+?)\\/?(?=\\/|\\$)', '/api/$1')
          .replace(/[^a-zA-Z0-9\/]/g, '');
        extractRoutes(layer.handle.stack, routerBasePath);
      }
    });
  }
  
  extractRoutes(app._router.stack);
  res.json({ routes });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({ 
    success: false,
    message: 'Something went wrong!',
    ...(process.env.NODE_ENV === 'development' && { error: err.message })
  });
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Database: ${process.env.DB_NAME}`);
  console.log(`API endpoints available at: http://localhost:${PORT}/api`);
  console.log(`Comments endpoint: http://localhost:${PORT}/api/comments`);
  console.log(`Communities endpoint: http://localhost:${PORT}/api/communities`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.log('Unhandled Promise Rejection:', err);
  process.exit(1);
});

module.exports = app;