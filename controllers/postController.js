//controllers/postController.js
const { validationResult } = require('express-validator');
const pool = require('../config/database');
const getPosts = async (req, res) => {
  try {
    const { page = 1, limit = 10, community_id, search } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT 
        p.id,
        p.title,
        p.body,
        p.image,
        p.created_at,
        p.updated_at,
        p.user_id,
        u.username,
        c.name as community_name,
        c.id as community_id,
        COUNT(DISTINCT pl.id) as like_count,
        COUNT(DISTINCT cm.id) as comment_count
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN communities c ON p.community_id = c.id
      LEFT JOIN post_likes pl ON p.id = pl.post_id
      LEFT JOIN comments cm ON p.id = cm.post_id
    `;
    
    const queryParams = [];
    const conditions = [];
    
    if (community_id) {
      conditions.push(`p.community_id = $${queryParams.length + 1}`);
      queryParams.push(community_id);
    }
    
    if (search) {
      conditions.push(`(p.title ILIKE $${queryParams.length + 1} OR p.body ILIKE $${queryParams.length + 1})`);
      queryParams.push(`%${search}%`);
    }
    
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    
    query += ` GROUP BY p.id, u.username, c.name, c.id ORDER BY p.created_at DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
    queryParams.push(limit, offset);
    
    console.log('Executing query:', query);
    console.log('With params:', queryParams);
    
    const result = await pool.query(query, queryParams);
    
    // Get total count for pagination
    let countQuery = `SELECT COUNT(DISTINCT p.id) as total FROM posts p`;
    const countParams = [];
    
    if (community_id) {
      countQuery += ` WHERE p.community_id = $1`;
      countParams.push(community_id);
    }
    
    if (search) {
      const whereClause = community_id ? ' AND ' : ' WHERE ';
      countQuery += `${whereClause}(p.title ILIKE $${countParams.length + 1} OR p.body ILIKE $${countParams.length + 1})`;
      countParams.push(`%${search}%`);
    }
    
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);
    
    res.json({
      success: true,
      data: {
        posts: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
    
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching posts',
      error: error.message
    });
  }
};

const createPost = async (req, res) => {
  try {
    console.log('Creating post with data:', req.body);
    console.log('File uploaded:', req.file);
    console.log('User from token:', req.user);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { title, body, community_id } = req.body;
    const user_id = req.user.id;
    const image = req.file ? req.file.filename : null;

    // Verify community exists
    const communityCheck = await pool.query(
      'SELECT id FROM communities WHERE id = $1',
      [community_id]
    );

    if (communityCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Community not found'
      });
    }

    const result = await pool.query(
      `INSERT INTO posts (title, body, community_id, user_id, image, created_at, updated_at) 
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) 
       RETURNING *`,
      [title, body, community_id, user_id, image]
    );

    console.log('Post created successfully:', result.rows[0]);

    res.status(201).json({
      success: true,
      message: 'Post created successfully',
      data: {
        post: result.rows[0]
      }
    });

  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating post',
      error: error.message
    });
  }
};

const getPostById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        p.*,
        u.username,
        c.name as community_name,
        COUNT(DISTINCT pl.id) as like_count,
        COUNT(DISTINCT cm.id) as comment_count
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN communities c ON p.community_id = c.id
      LEFT JOIN post_likes pl ON p.id = pl.post_id
      LEFT JOIN comments cm ON p.id = cm.post_id
      WHERE p.id = $1
      GROUP BY p.id, u.username, c.name
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }
    
    res.json({
      success: true,
      data: {
        post: result.rows[0]
      }
    });
  } catch (error) {
    console.error('Error fetching post:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching post'
    });
  }
};

const updatePost = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const { title, body } = req.body;
    const image = req.file ? req.file.filename : null;

    // Check if post exists and user owns it
    const existingPost = await pool.query(
      'SELECT * FROM posts WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (existingPost.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Post not found or unauthorized'
      });
    }

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (title) {
      updates.push(`title = $${paramCount}`);
      values.push(title);
      paramCount++;
    }

    if (body !== undefined) {
      updates.push(`body = $${paramCount}`);
      values.push(body);
      paramCount++;
    }

    if (image) {
      updates.push(`image = $${paramCount}`);
      values.push(image);
      paramCount++;
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE posts 
      SET ${updates.join(', ')} 
      WHERE id = $${paramCount} 
      RETURNING *
    `;

    const result = await pool.query(query, values);

    res.json({
      success: true,
      message: 'Post updated successfully',
      data: {
        post: result.rows[0]
      }
    });

  } catch (error) {
    console.error('Error updating post:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating post'
    });
  }
};

const deletePost = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if post exists and user owns it
    const existingPost = await pool.query(
      'SELECT * FROM posts WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (existingPost.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Post not found or unauthorized'
      });
    }

    await pool.query('DELETE FROM posts WHERE id = $1', [id]);

    res.json({
      success: true,
      message: 'Post deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting post:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting post'
    });
  }
};

const toggleLike = async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user.id;

    // Check if post exists
    const postExists = await pool.query('SELECT id FROM posts WHERE id = $1', [id]);
    if (postExists.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Check if user already liked the post
    const existingLike = await pool.query(
      'SELECT id FROM post_likes WHERE post_id = $1 AND user_id = $2',
      [id, user_id]
    );

    if (existingLike.rows.length > 0) {
      // Remove like
      await pool.query(
        'DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2',
        [id, user_id]
      );
    } else {
      // Add like
      await pool.query(
        'INSERT INTO post_likes (post_id, user_id, created_at) VALUES ($1, $2, NOW())',
        [id, user_id]
      );
    }

    // Get updated like count
    const likeCount = await pool.query(
      'SELECT COUNT(*) as count FROM post_likes WHERE post_id = $1',
      [id]
    );

    res.json({
      success: true,
      message: existingLike.rows.length > 0 ? 'Post unliked' : 'Post liked',
      data: {
        liked: existingLike.rows.length === 0,
        like_count: parseInt(likeCount.rows[0].count)
      }
    });

  } catch (error) {
    console.error('Error toggling like:', error);
    res.status(500).json({
      success: false,
      message: 'Error toggling like'
    });
  }
};

const getPostsByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const result = await pool.query(`
      SELECT
        p.*,
        u.username,
        c.name as community_name,
        COUNT(DISTINCT pl.id) as like_count,
        COUNT(DISTINCT cm.id) as comment_count
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN communities c ON p.community_id = c.id
      LEFT JOIN post_likes pl ON p.id = pl.post_id
      LEFT JOIN comments cm ON p.id = cm.post_id
      WHERE p.user_id = $1
      GROUP BY p.id, u.username, c.name
      ORDER BY p.created_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);

    const countResult = await pool.query(
      'SELECT COUNT(*) as total FROM posts WHERE user_id = $1',
      [userId]
    );

    res.json({
      success: true,
      data: {
        posts: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(countResult.rows[0].total),
          pages: Math.ceil(countResult.rows[0].total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Error fetching user posts:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user posts'
    });
  }
};

module.exports = {
  getPosts,
  getPostById,
  createPost,
  updatePost,
  deletePost,
  toggleLike,
  getPostsByUser
};