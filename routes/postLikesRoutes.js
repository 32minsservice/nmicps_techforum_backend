const express = require('express');
const router = express.Router();
const pool = require('../db'); // your PostgreSQL connection
const jwt = require('jsonwebtoken');

// Middleware to verify JWT token and extract user ID
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    console.log('Auth header:', authHeader);
    console.log('Extracted token:', token);

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Access token required'
        });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            console.error('JWT verification error:', err);
            return res.status(403).json({
                success: false,
                message: 'Invalid or expired token'
            });
        }
        
        console.log('Decoded JWT user:', user);
        
        // Make sure user.id exists
        if (!user.id && !user.userId && !user.user_id) {
            console.error('No user ID found in JWT token:', user);
            return res.status(403).json({
                success: false,
                message: 'Invalid token: no user ID found'
            });
        }
        
        // Normalize user ID (handle different possible field names)
        req.user = {
            ...user,
            id: user.id || user.userId || user.user_id
        };
        
        console.log('User set on request:', req.user);
        next();
    });
};

// GET all likes (for debugging - you might want to remove this in production)
router.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM post_likes ORDER BY created_at DESC');
        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching post_likes:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching post_likes'
        });
    }
});

// POST route to like/unlike a post
router.post('/:postId', authenticateToken, async (req, res) => {
    const { postId } = req.params;
    const userId = req.user.id; // Get user ID from JWT token

    try {
        // Check if user has already liked this post
        const existingLike = await pool.query(
            'SELECT * FROM post_likes WHERE post_id = $1 AND user_id = $2',
            [postId, userId]
        );

        let liked = false;
        let likeCount = 0;

        if (existingLike.rows.length > 0) {
            // User has already liked this post, so unlike it
            await pool.query(
                'DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2',
                [postId, userId]
            );
            liked = false;
        } else {
            // User hasn't liked this post, so like it
            await pool.query(
                'INSERT INTO post_likes (post_id, user_id, created_at) VALUES ($1, $2, NOW())',
                [postId, userId]
            );
            liked = true;
        }

        // Get updated like count for this post
        const likeCountResult = await pool.query(
            'SELECT COUNT(*) as count FROM post_likes WHERE post_id = $1',
            [postId]
        );

        likeCount = parseInt(likeCountResult.rows[0].count);

        res.json({
            success: true,
            liked: liked,
            likeCount: likeCount,
            message: liked ? 'Post liked successfully' : 'Post unliked successfully'
        });

    } catch (error) {
        console.error('Error toggling like:', error);
        res.status(500).json({
            success: false,
            message: 'Server error toggling like'
        });
    }
});

// GET route to check if user liked a specific post
router.get('/check/:postId', authenticateToken, async (req, res) => {
    const { postId } = req.params;
    const userId = req.user.id;

    try {
        const result = await pool.query(
            'SELECT * FROM post_likes WHERE post_id = $1 AND user_id = $2',
            [postId, userId]
        );

        res.json({
            success: true,
            liked: result.rows.length > 0
        });
    } catch (error) {
        console.error('Error checking like status:', error);
        res.status(500).json({
            success: false,
            message: 'Server error checking like status'
        });
    }
});

module.exports = router;