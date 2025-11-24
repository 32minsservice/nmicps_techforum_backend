// controllers/communityController.js
const { validationResult } = require('express-validator');
const pool = require('../config/database');

// Get all communities
const getCommunities = async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `
      SELECT 
        c.id,
        c.name,
        c.created_at,
        u.username as created_by_username,
        COUNT(DISTINCT p.id) as post_count,
        COUNT(DISTINCT uc.user_id) as member_count
      FROM communities c
      LEFT JOIN users u ON c.created_by = u.id
      LEFT JOIN posts p ON c.id = p.community_id
      LEFT JOIN user_communities uc ON c.id = uc.community_id
    `;

    const params = [];
    const conditions = [];

    // Add search filter
    if (search) {
      conditions.push(`c.name ILIKE $${params.length + 1}`);
      params.push(`%${search}%`);
    }

    // Add WHERE clause if there are conditions
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    // Add GROUP BY and ORDER BY
    query += `
      GROUP BY c.id, c.name, c.created_at, u.username
      ORDER BY c.name ASC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    params.push(parseInt(limit), offset);

    const result = await pool.query(query, params);

    // Get total count for pagination
    let countQuery = `SELECT COUNT(*) as total FROM communities c`;
    const countParams = [];

    if (search) {
      countQuery += ' WHERE c.name ILIKE $1';
      countParams.push(`%${search}%`);
    }

    const countResult = await pool.query(countQuery, countParams);
    const totalCommunities = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalCommunities / parseInt(limit));

    res.json({
      success: true,
      data: {
        communities: result.rows,
        pagination: {
          current_page: parseInt(page),
          total_pages: totalPages,
          total_communities: totalCommunities,
          per_page: parseInt(limit),
          has_next: parseInt(page) < totalPages,
          has_prev: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    console.error('Get communities error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching communities'
    });
  }
};

// Get single community by ID
const getCommunityById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user ? req.user.userId : null;

    const result = await pool.query(`
      SELECT 
        c.id,
        c.name,
        c.created_at,
        u.username as created_by_username,
        u.id as created_by_id,
        COUNT(DISTINCT p.id) as post_count,
        COUNT(DISTINCT uc.user_id) as member_count,
        CASE WHEN user_membership.user_id IS NOT NULL THEN true ELSE false END as is_member
      FROM communities c
      LEFT JOIN users u ON c.created_by = u.id
      LEFT JOIN posts p ON c.id = p.community_id
      LEFT JOIN user_communities uc ON c.id = uc.community_id
      LEFT JOIN user_communities user_membership ON c.id = user_membership.community_id AND user_membership.user_id = $2
      WHERE c.id = $1
      GROUP BY c.id, c.name, c.created_at, u.username, u.id, user_membership.user_id
    `, [id, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Community not found'
      });
    }

    res.json({
      success: true,
      data: {
        community: result.rows[0]
      }
    });

  } catch (error) {
    console.error('Get community by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching community'
    });
  }
};

// Create new community
const createCommunity = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { name } = req.body;
    const userId = req.user.userId;

    // Check if community name already exists
    const existingCommunity = await pool.query(
      'SELECT id FROM communities WHERE name = $1',
      [name]
    );

    if (existingCommunity.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Community with this name already exists'
      });
    }

    // Create community
    const result = await pool.query(`
      INSERT INTO communities (name, created_by)
      VALUES ($1, $2)
      RETURNING id, name, created_by, created_at
    `, [name, userId]);

    const community = result.rows[0];

    // Automatically join the creator to the community
    await pool.query(`
      INSERT INTO user_communities (user_id, community_id)
      VALUES ($1, $2)
    `, [userId, community.id]);

    // Get community with creator info
    const communityWithInfo = await pool.query(`
      SELECT 
        c.*,
        u.username as created_by_username
      FROM communities c
      LEFT JOIN users u ON c.created_by = u.id
      WHERE c.id = $1
    `, [community.id]);

    res.status(201).json({
      success: true,
      message: 'Community created successfully',
      data: {
        community: communityWithInfo.rows[0]
      }
    });

  } catch (error) {
    console.error('Create community error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating community'
    });
  }
};

// Update community
const updateCommunity = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const userId = req.user.userId;

    // Check if community exists and user created it
    const communityCheck = await pool.query(
      'SELECT id, created_by FROM communities WHERE id = $1',
      [id]
    );

    if (communityCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Community not found'
      });
    }

    const community = communityCheck.rows[0];
    if (community.created_by !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this community'
      });
    }

    // Check if new name already exists (excluding current community)
    if (name) {
      const existingCommunity = await pool.query(
        'SELECT id FROM communities WHERE name = $1 AND id != $2',
        [name, id]
      );

      if (existingCommunity.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Community with this name already exists'
        });
      }
    }

    // Update community
    const result = await pool.query(`
      UPDATE communities 
      SET name = COALESCE($1, name)
      WHERE id = $2
      RETURNING *
    `, [name, id]);

    res.json({
      success: true,
      message: 'Community updated successfully',
      data: {
        community: result.rows[0]
      }
    });

  } catch (error) {
    console.error('Update community error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating community'
    });
  }
};

// Delete community
const deleteCommunity = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // Check if community exists and user created it
    const communityCheck = await pool.query(
      'SELECT id, created_by FROM communities WHERE id = $1',
      [id]
    );

    if (communityCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Community not found'
      });
    }

    const community = communityCheck.rows[0];
    if (community.created_by !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this community'
      });
    }

    // Delete community (cascades will handle posts, comments, and memberships)
    await pool.query('DELETE FROM communities WHERE id = $1', [id]);

    res.json({
      success: true,
      message: 'Community deleted successfully'
    });

  } catch (error) {
    console.error('Delete community error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting community'
    });
  }
};

// Join community
const joinCommunity = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // Check if community exists
    const communityCheck = await pool.query('SELECT id FROM communities WHERE id = $1', [id]);
    if (communityCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Community not found'
      });
    }

    // Check if already a member
    const existingMembership = await pool.query(
      'SELECT id FROM user_communities WHERE user_id = $1 AND community_id = $2',
      [userId, id]
    );

    if (existingMembership.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Already a member of this community'
      });
    }

    // Join community
    await pool.query(
      'INSERT INTO user_communities (user_id, community_id) VALUES ($1, $2)',
      [userId, id]
    );

    res.json({
      success: true,
      message: 'Successfully joined the community'
    });

  } catch (error) {
    console.error('Join community error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error joining community'
    });
  }
};

// Leave community
const leaveCommunity = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // Check if community exists
    const communityCheck = await pool.query('SELECT id, created_by FROM communities WHERE id = $1', [id]);
    if (communityCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Community not found'
      });
    }

    const community = communityCheck.rows[0];

    // Prevent creator from leaving their own community
    if (community.created_by === userId) {
      return res.status(400).json({
        success: false,
        message: 'Community creators cannot leave their own communities'
      });
    }

    // Check if member of community
    const membership = await pool.query(
      'SELECT id FROM user_communities WHERE user_id = $1 AND community_id = $2',
      [userId, id]
    );

    if (membership.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Not a member of this community'
      });
    }

    // Leave community
    await pool.query(
      'DELETE FROM user_communities WHERE user_id = $1 AND community_id = $2',
      [userId, id]
    );

    res.json({
      success: true,
      message: 'Successfully left the community'
    });

  } catch (error) {
    console.error('Leave community error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error leaving community'
    });
  }
};

// Get community members
const getCommunityMembers = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Check if community exists
    const communityCheck = await pool.query('SELECT id FROM communities WHERE id = $1', [id]);
    if (communityCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Community not found'
      });
    }

    const result = await pool.query(`
      SELECT 
        u.id,
        u.username,
        u.email,
        u.profile_image,
        uc.joined_at,
        CASE WHEN c.created_by = u.id THEN true ELSE false END as is_creator
      FROM user_communities uc
      JOIN users u ON uc.user_id = u.id
      JOIN communities c ON uc.community_id = c.id
      WHERE uc.community_id = $1
      ORDER BY uc.joined_at ASC
      LIMIT $2 OFFSET $3
    `, [id, parseInt(limit), offset]);

    // Get total member count
    const countResult = await pool.query(
      'SELECT COUNT(*) as total FROM user_communities WHERE community_id = $1',
      [id]
    );

    const totalMembers = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalMembers / parseInt(limit));

    res.json({
      success: true,
      data: {
        members: result.rows,
        pagination: {
          current_page: parseInt(page),
          total_pages: totalPages,
          total_members: totalMembers,
          per_page: parseInt(limit),
          has_next: parseInt(page) < totalPages,
          has_prev: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    console.error('Get community members error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching community members'
    });
  }
};

// Get user's communities
const getUserCommunities = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const result = await pool.query(`
      SELECT 
        c.id,
        c.name,
        c.created_at,
        uc.joined_at,
        u.username as created_by_username,
        COUNT(DISTINCT p.id) as post_count,
        COUNT(DISTINCT members.user_id) as member_count,
        CASE WHEN c.created_by = $1 THEN true ELSE false END as is_creator
      FROM user_communities uc
      JOIN communities c ON uc.community_id = c.id
      LEFT JOIN users u ON c.created_by = u.id
      LEFT JOIN posts p ON c.id = p.community_id
      LEFT JOIN user_communities members ON c.id = members.community_id
      WHERE uc.user_id = $1
      GROUP BY c.id, c.name, c.created_at, uc.joined_at, u.username, c.created_by
      ORDER BY uc.joined_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, parseInt(limit), offset]);

    res.json({
      success: true,
      data: {
        communities: result.rows
      }
    });

  } catch (error) {
    console.error('Get user communities error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching user communities'
    });
  }
};

module.exports = {
  getCommunities,
  getCommunityById,
  createCommunity,
  updateCommunity,
  deleteCommunity,
  joinCommunity,
  leaveCommunity,
  getCommunityMembers,
  getUserCommunities
};