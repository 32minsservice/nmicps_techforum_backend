//middleware/authMiddleware.js

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// File upload configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname))
  }
});
const upload = multer({ storage: storage });

// JWT middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.sendStatus(401);
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // Check if user exists
    const userExists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email',
      [username, email, passwordHash]
    );

    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);

    res.status(201).json({ token, user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);
    
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        username: user.username, 
        email: user.email,
        profile_image: user.profile_image 
      } 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Community Routes
app.get('/api/communities', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM communities ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/communities', authenticateToken, async (req, res) => {
  try {
    const { name } = req.body;
    const result = await pool.query(
      'INSERT INTO communities (name, created_by) VALUES ($1, $2) RETURNING *',
      [name, req.user.userId]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Post Routes
app.get('/api/posts', async (req, res) => {
  try {
    const { page = 1, limit = 10, community_id, search } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT p.*, u.username, u.profile_image, c.name as community_name,
             COUNT(DISTINCT pl.id) as like_count,
             COUNT(DISTINCT cm.id) as comment_count
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN communities c ON p.community_id = c.id
      LEFT JOIN post_likes pl ON p.id = pl.post_id
      LEFT JOIN comments cm ON p.id = cm.post_id
    `;
    
    const params = [];
    const conditions = [];

    if (community_id) {
      conditions.push(`p.community_id = $${params.length + 1}`);
      params.push(community_id);
    }

    if (search) {
      conditions.push(`(p.title ILIKE $${params.length + 1} OR p.body ILIKE $${params.length + 1})`);
      params.push(`%${search}%`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ` GROUP BY p.id, u.username, u.profile_image, c.name
               ORDER BY p.created_at DESC
               LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    
    params.push(limit, offset);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/posts', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const { title, body, community_id } = req.body;
    const image = req.file ? req.file.filename : null;

    const result = await pool.query(
      'INSERT INTO posts (title, body, image, community_id, user_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [title, body, image, community_id, req.user.userId]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Comment Routes
app.get('/api/posts/:postId/comments', async (req, res) => {
  try {
    const { postId } = req.params;
    const result = await pool.query(`
      WITH RECURSIVE comment_tree AS (
        SELECT c.*, u.username, u.profile_image, 0 as level,
               COUNT(cl.id) as like_count
        FROM comments c
        LEFT JOIN users u ON c.user_id = u.id
        LEFT JOIN comments_likes cl ON c.id = cl.comment_id
        WHERE c.post_id = $1 AND c.parent_comment_id IS NULL
        GROUP BY c.id, u.username, u.profile_image
        
        UNION ALL
        
        SELECT c.*, u.username, u.profile_image, ct.level + 1,
               COUNT(cl.id) as like_count
        FROM comments c
        LEFT JOIN users u ON c.user_id = u.id
        LEFT JOIN comments_likes cl ON c.id = cl.comment_id
        INNER JOIN comment_tree ct ON c.parent_comment_id = ct.id
        GROUP BY c.id, u.username, u.profile_image, ct.level
      )
      SELECT * FROM comment_tree ORDER BY created_at ASC
    `, [postId]);

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/posts/:postId/comments', authenticateToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const { body, parent_comment_id } = req.body;

    const result = await pool.query(
      'INSERT INTO comments (body, post_id, user_id, parent_comment_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [body, postId, req.user.userId, parent_comment_id || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Like Routes (for posts)
app.post('/api/posts/:postId/like', authenticateToken, async (req, res) => {
  try {
    const { postId } = req.params;
    
    // Check if already liked
    const existingLike = await pool.query(
      'SELECT id FROM post_likes WHERE post_id = $1 AND user_id = $2',
      [postId, req.user.userId]
    );

    if (existingLike.rows.length > 0) {
      // Unlike
      await pool.query(
        'DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2',
        [postId, req.user.userId]
      );
      res.json({ liked: false });
    } else {
      // Like
      await pool.query(
        'INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2)',
        [postId, req.user.userId]
      );
      res.json({ liked: true });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Like Routes (for comments)
app.post('/api/comments/:commentId/like', authenticateToken, async (req, res) => {
  try {
    const { commentId } = req.params;
    
    const existingLike = await pool.query(
      'SELECT id FROM comments_likes WHERE comment_id = $1 AND user_id = $2',
      [commentId, req.user.userId]
    );

    if (existingLike.rows.length > 0) {
      await pool.query(
        'DELETE FROM comments_likes WHERE comment_id = $1 AND user_id = $2',
        [commentId, req.user.userId]
      );
      res.json({ liked: false });
    } else {
      await pool.query(
        'INSERT INTO comments_likes (comment_id, user_id) VALUES ($1, $2)',
        [commentId, req.user.userId]
      );
      res.json({ liked: true });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});