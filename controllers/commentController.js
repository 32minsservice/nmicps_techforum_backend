// controllers/commentController.js - With nested comment structure

const { validationResult } = require('express-validator');
const pool = require('../config/database');
const { validateCommentToxicity } = require('../utils/toxicityService');

// Get comments for a post (with nested structure)
const getComments = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user ? req.user.userId : null;

    console.log('🔍 Getting comments for post:', postId, 'User:', userId);

    // Check if post exists
    const postCheck = await pool.query('SELECT id FROM posts WHERE id = $1', [postId]);
    if (postCheck.rows.length === 0) {
      console.log('❌ Post not found:', postId);
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    console.log('✅ Post exists, fetching comments...');

    // Fetch ALL comments (both parent and replies) with user info
    const allCommentsResult = await pool.query(`
      SELECT 
        c.id,
        c.body,
        c.post_id,
        c.user_id,
        c.parent_comment_id,
        c.created_at,
        c.updated_at,
        u.username,
        u.profile_image,
        COALESCE(like_counts.like_count, 0) as like_count,
        CASE WHEN user_likes.user_id IS NOT NULL THEN true ELSE false END as is_liked_by_user
      FROM comments c
      LEFT JOIN users u ON c.user_id = u.id
      LEFT JOIN (
        SELECT comment_id, COUNT(*) as like_count 
        FROM comments_likes 
        GROUP BY comment_id
      ) like_counts ON c.id = like_counts.comment_id
      LEFT JOIN comments_likes user_likes ON c.id = user_likes.comment_id AND user_likes.user_id = $2
      WHERE c.post_id = $1
      ORDER BY c.created_at ASC
    `, [postId, userId]);

    console.log('📝 Total comments found:', allCommentsResult.rows.length);

    // Transform flat list into nested structure
    const commentsMap = new Map();
    const rootComments = [];

    // First pass: Create map of all comments
    allCommentsResult.rows.forEach(comment => {
      commentsMap.set(comment.id, {
        ...comment,
        like_count: parseInt(comment.like_count),
        replies: [] // Initialize empty replies array
      });
    });

    // Second pass: Build nested structure
    allCommentsResult.rows.forEach(comment => {
      const commentWithReplies = commentsMap.get(comment.id);
      
      if (comment.parent_comment_id === null) {
        // This is a root comment
        rootComments.push(commentWithReplies);
      } else {
        // This is a reply, add it to parent's replies array
        const parentComment = commentsMap.get(comment.parent_comment_id);
        if (parentComment) {
          parentComment.replies.push(commentWithReplies);
        }
      }
    });

    console.log('✅ Nested structure created:', {
      rootComments: rootComments.length,
      totalWithReplies: allCommentsResult.rows.length
    });

    res.json({
      success: true,
      data: rootComments // Send only root comments (replies are nested inside)
    });

  } catch (error) {
    console.error('❌ Get comments error:', error);
    console.error('Error details:', error.message);
    
    res.status(500).json({
      success: false,
      message: 'Server error fetching comments',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Create new comment
const createComment = async (req, res) => {
  try {
    // 1️⃣ Validation check
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { postId } = req.params;
    const { body, parent_comment_id } = req.body;
    const userId = req.user.userId;

    console.log('📝 Creating comment:', body.substring(0, 50));

    // 2️⃣ Toxicity validation
    const toxicityResult = await validateCommentToxicity(body);

    if (!toxicityResult.allowed) {
      return res.status(400).json({
        success: false,
        message: 'Comment contains toxic or abusive content',
        toxicity: toxicityResult.scores
      });
    }

    // 3️⃣ Check post exists
    const postCheck = await pool.query(
      'SELECT id FROM posts WHERE id = $1',
      [postId]
    );

    if (postCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // 4️⃣ Parent comment validation
    if (parent_comment_id) {
      const parentCheck = await pool.query(
        'SELECT id, post_id FROM comments WHERE id = $1',
        [parent_comment_id]
      );

      if (
        parentCheck.rows.length === 0 ||
        parentCheck.rows[0].post_id !== parseInt(postId)
      ) {
        return res.status(400).json({
          success: false,
          message: 'Invalid parent comment'
        });
      }
    }

    // 5️⃣ Insert comment
    const result = await pool.query(`
      INSERT INTO comments (body, post_id, user_id, parent_comment_id)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [body, postId, userId, parent_comment_id || null]);

    // 6️⃣ Fetch comment with user info
    const commentWithInfo = await pool.query(`
      SELECT 
        c.*,
        u.username,
        u.profile_image,
        0 as like_count,
        false as is_liked_by_user
      FROM comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.id = $1
    `, [result.rows[0].id]);

    res.status(201).json({
      success: true,
      message: parent_comment_id ? 'Reply posted successfully' : 'Comment created successfully',
      data: {
        comment: {
          ...commentWithInfo.rows[0],
          like_count: 0,
          replies: [] // Add empty replies array for consistency
        }
      }
    });

  } catch (error) {
    console.error('❌ Create comment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating comment'
    });
  }
};

// Update comment
const updateComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { body } = req.body;
    const userId = req.user.userId;

    // Check if comment exists and user owns it
    const commentCheck = await pool.query(
      'SELECT id, user_id FROM comments WHERE id = $1',
      [id]
    );

    if (commentCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found'
      });
    }

    const comment = commentCheck.rows[0];
    if (comment.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this comment'
      });
    }

    // Update comment
    const result = await pool.query(`
      UPDATE comments 
      SET body = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [body, id]);

    res.json({
      success: true,
      message: 'Comment updated successfully',
      data: {
        comment: result.rows[0]
      }
    });

  } catch (error) {
    console.error('Update comment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating comment'
    });
  }
};

// Delete comment
const deleteComment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // Check if comment exists and user owns it
    const commentCheck = await pool.query(
      'SELECT id, user_id FROM comments WHERE id = $1',
      [id]
    );

    if (commentCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found'
      });
    }

    const comment = commentCheck.rows[0];
    if (comment.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this comment'
      });
    }

    // Delete comment (cascades will handle nested comments and likes)
    await pool.query('DELETE FROM comments WHERE id = $1', [id]);

    res.json({
      success: true,
      message: 'Comment deleted successfully'
    });

  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting comment'
    });
  }
};

// Toggle like/unlike comment
const toggleLike = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    console.log('👍 Toggling like for comment:', id, 'by user:', userId);

    // Check if comment exists
    const commentCheck = await pool.query('SELECT id FROM comments WHERE id = $1', [id]);
    if (commentCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found'
      });
    }

    // Check if already liked
    const existingLike = await pool.query(
      'SELECT id FROM comments_likes WHERE comment_id = $1 AND user_id = $2',
      [id, userId]
    );

    let liked = false;
    let message = '';

    if (existingLike.rows.length > 0) {
      // Unlike
      await pool.query(
        'DELETE FROM comments_likes WHERE comment_id = $1 AND user_id = $2',
        [id, userId]
      );
      message = 'Comment unliked successfully';
      liked = false;
    } else {
      // Like
      await pool.query(
        'INSERT INTO comments_likes (comment_id, user_id) VALUES ($1, $2)',
        [id, userId]
      );
      message = 'Comment liked successfully';
      liked = true;
    }

    // Get updated like count
    const likeCountResult = await pool.query(
      'SELECT COUNT(*) as like_count FROM comments_likes WHERE comment_id = $1',
      [id]
    );

    console.log('✅ Like toggled successfully:', { liked, like_count: likeCountResult.rows[0].like_count });

    res.json({
      success: true,
      message,
      data: {
        liked,
        like_count: parseInt(likeCountResult.rows[0].like_count)
      }
    });

  } catch (error) {
    console.error('Toggle comment like error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error toggling like'
    });
  }
};

// Get comments by user
const getCommentsByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const currentUserId = req.user ? req.user.userId : null;

    const result = await pool.query(`
      SELECT 
        c.id,
        c.body,
        c.created_at,
        c.updated_at,
        u.username,
        u.profile_image,
        p.title as post_title,
        p.id as post_id,
        COUNT(cl.id) as like_count,
        CASE WHEN user_likes.user_id IS NOT NULL THEN true ELSE false END as is_liked_by_user
      FROM comments c
      LEFT JOIN users u ON c.user_id = u.id
      LEFT JOIN posts p ON c.post_id = p.id
      LEFT JOIN comments_likes cl ON c.id = cl.comment_id
      LEFT JOIN comments_likes user_likes ON c.id = user_likes.comment_id AND user_likes.user_id = $1
      WHERE c.user_id = $2
      GROUP BY c.id, u.username, u.profile_image, p.title, p.id, user_likes.user_id
      ORDER BY c.created_at DESC
      LIMIT $3 OFFSET $4
    `, [currentUserId, userId, parseInt(limit), offset]);

    res.json({
      success: true,
      data: {
        comments: result.rows
      }
    });

  } catch (error) {
    console.error('Get comments by user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching user comments'
    });
  }
};

module.exports = {
  getComments,
  createComment,
  updateComment,
  deleteComment,
  toggleLike,
  getCommentsByUser
};