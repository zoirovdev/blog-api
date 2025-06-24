// server.js

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const prisma = require('./db.js');
const { hashPassword, comparePassword, generateToken, authenticateToken } = require('./auth.js');
const { registerSchema, loginSchema, createPostSchema, updatePostSchema, validate } = require('./validation.js');
const { generalLimiter, authLimiter, createPostLimiter, errorHandler, requestLogger, notFoundHandler } = require('./middleware.js');
const { specs, swaggerUi } = require('./swagger');

const app = express();
const PORT = process.env.PORT || 8000;

// Add CORS middleware BEFORE your routes
app.use(cors({
  origin: 'http://localhost:5173' // Your React app's URL
}))

// Middleware to parse JSON bodies
app.use(express.json());

app.use(requestLogger); // Log all requests
app.use(generalLimiter); // Apply general rate limiting to all routes

// Swagger documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

/**
 * @swagger
 * /:
 *   get:
 *     summary: API health check
 *     tags: [System]
 *     responses:
 *       200:
 *         description: API is working
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Blog API with Prisma is working!"
 */
// Test route
app.get('/', (req, res) => {
    res.json({ message: 'Blog API with Prisma is working!' });
});

/**
 * @swagger
 * /api/posts:
 *   get:
 *     summary: Get all posts with pagination
 *     tags: [Posts]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of posts per page
 *       - in: query
 *         name: published
 *         schema:
 *           type: boolean
 *         description: Filter by published status
 *       - in: query
 *         name: authorId
 *         schema:
 *           type: integer
 *         description: Filter by author ID
 *     responses:
 *       200:
 *         description: List of posts with pagination info
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 posts:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Post'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     currentPage:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                     totalPosts:
 *                       type: integer
 *                     postsPerPage:
 *                       type: integer
 *                     hasNextPage:
 *                       type: boolean
 *                     hasPrevPage:
 *                       type: boolean
 *                 filters:
 *                   type: object
 */
// Get all posts with pagination
app.get('/api/posts', async (req, res) => {
    try {
        // Extract query parameters with defaults
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const published = req.query.published;
        const authorId = req.query.authorId;
        
        // Calculate offset for pagination
        const offset = (page - 1) * limit;
        
        // Build where conditions
        const whereConditions = {};
        
        // Filter by published status
        if (published !== undefined) {
            whereConditions.published = published === 'true';
        }
        
        // Filter by author
        if (authorId) {
            whereConditions.authorId = parseInt(authorId);
        }
        
        // Get posts with pagination
        const posts = await prisma.post.findMany({
            where: whereConditions,
            include: {
                author: {
                    select: {
                        id: true,
                        username: true,
                        firstName: true,
                        lastName: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }, // Newest first
            skip: offset,
            take: limit
        });
        
        // Get total count for pagination info
        const totalPosts = await prisma.post.count({
            where: whereConditions
        });
        
        // Calculate pagination info
        const totalPages = Math.ceil(totalPosts / limit);
        const hasNextPage = page < totalPages;
        const hasPrevPage = page > 1;
        
        res.json({
            posts,
            pagination: {
                currentPage: page,
                totalPages,
                totalPosts,
                postsPerPage: limit,
                hasNextPage,
                hasPrevPage
            },
            filters: {
                published: published || null,
                authorId: authorId || null
            }
        });
        
    } catch (error) {
        res.status(500).json({
            error: 'Failed to fetch posts',
            details: error.message
        });
    }
});

/**
 * @swagger
 * /api/posts/search:
 *   get:
 *     summary: Advanced search for posts
 *     tags: [Posts]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query (searches in title, content, and author names)
 *       - in: query
 *         name: author
 *         schema:
 *           type: string
 *         description: Filter by author username
 *       - in: query
 *         name: published
 *         schema:
 *           type: boolean
 *         description: Filter by published status
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [createdAt, updatedAt, title]
 *           default: createdAt
 *         description: Sort field
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *     responses:
 *       200:
 *         description: Search results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 query:
 *                   type: string
 *                 results:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Post'
 *                 count:
 *                   type: integer
 *       400:
 *         description: Search query is required
 */
// Advanced search endpoint
app.get('/api/posts/search', async (req, res) => {
    try {
        const { q, author, published, sortBy = 'createdAt', order = 'desc' } = req.query;
        
        if (!q) {
            return res.status(400).json({ error: 'Search query (q) is required' });
        }
        
        const whereConditions = {
            OR: [
                { title: { contains: q, mode: 'insensitive' } },
                { content: { contains: q, mode: 'insensitive' } },
                { 
                    author: {
                        OR: [
                            { username: { contains: q, mode: 'insensitive' } },
                            { firstName: { contains: q, mode: 'insensitive' } },
                            { lastName: { contains: q, mode: 'insensitive' } }
                        ]
                    }
                }
            ]
        };
        
        // Additional filters
        if (published !== undefined) {
            whereConditions.published = published === 'true';
        }
        
        if (author) {
            whereConditions.author = {
                username: { contains: author, mode: 'insensitive' }
            };
        }
        
        const posts = await prisma.post.findMany({
            where: whereConditions,
            include: {
                author: {
                    select: {
                        id: true,
                        username: true,
                        firstName: true,
                        lastName: true
                    }
                }
            },
            orderBy: { [sortBy]: order }
        });
        
        res.json({
            query: q,
            results: posts,
            count: posts.length
        });
        
    } catch (error) {
        res.status(500).json({
            error: 'Search failed',
            details: error.message
        });
    }
});

/**
 * @swagger
 * /api/posts/{id}:
 *   get:
 *     summary: Get a specific post by ID
 *     tags: [Posts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Post ID
 *     responses:
 *       200:
 *         description: Post details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Post'
 *       404:
 *         description: Post not found
 *       500:
 *         description: Server error
 */
// Get a specific post by id
app.get('/api/posts/:id', async (req, res) => {
    try {
        const postId = parseInt(req.params.id);
        const post = await prisma.post.findUnique({
            where: { id: postId },
            include: {
                author: {
                    select: {
                        id: true,
                        username: true,
                        firstName: true,
                        lastName: true
                    }
                }
            }
        });
        
        if(!post){
            return res.status(404).json({ error: 'Post not found' });
        }

        res.json(post);
    } catch (error) {
           res.status(500).json({
            error: 'Failed to fetch post',
            details: error.message
        });
    }
});

/**
 * @swagger
 * /api/posts:
 *   post:
 *     summary: Create a new post
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - content
 *             properties:
 *               title:
 *                 type: string
 *                 example: "My Amazing Blog Post"
 *               content:
 *                 type: string
 *                 example: "This is the content of my blog post..."
 *               published:
 *                 type: boolean
 *                 default: false
 *                 example: false
 *     responses:
 *       201:
 *         description: Post created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Post'
 *       401:
 *         description: Authentication required
 *       400:
 *         description: Validation error
 */
// Create a new post (PROTECTED with validation)
app.post('/api/posts', createPostLimiter, authenticateToken, validate(createPostSchema), async (req, res) => {
    try {
        const { title, content, published = false } = req.body;
        
        // Use the authenticated user's ID as the author
        const authorId = req.userId;
        
        const newPost = await prisma.post.create({
            data: {
                title,
                content,
                published,
                authorId: authorId
            },
            include: {
                author: {
                    select: {
                        id: true,
                        username: true,
                        firstName: true,
                        lastName: true
                    }
                }
            }
        });

        res.status(201).json(newPost);
    } catch (error) {
        res.status(500).json({ 
            error: 'Failed to create post',
            details: error.message
        });
    }
});

/**
 * @swagger
 * /api/user/posts:
 *   get:
 *     summary: Get all posts by a specific user
 *     tags: [Posts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     responses:
 *       200:
 *         description: List of posts by the user
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Post'
 *       500:
 *         description: Server error
 */
// Get all posts by a specific user
app.get('/api/user/posts', async (req, res) => {
    try {
        // Extract query parameters with defaults
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const published = req.query.published;
        const authorId = req.query.authorId;
        
        // Calculate offset for pagination
        const offset = (page - 1) * limit;
        
        // Build where conditions
        const whereConditions = {};
        
        // Filter by published status
        if (published !== undefined) {
            whereConditions.published = published === 'true';
        }
        
        // Filter by author
        if (authorId) {
            whereConditions.authorId = parseInt(authorId);
        }
	
        // Get posts with pagination
        const posts = await prisma.post.findMany({
            where: whereConditions,
            include: {
                author: {
                    select: {
                        id: true,
                        username: true,
                        firstName: true,
                        lastName: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }, // Newest first
            skip: offset,
            take: limit
        });
        
        // Get total count for pagination info
        const totalPosts = await prisma.post.count({
            where: whereConditions
        });
        
        // Calculate pagination info
        const totalPages = Math.ceil(totalPosts / limit);
        const hasNextPage = page < totalPages;
        const hasPrevPage = page > 1;
        
        res.json({
            posts,
            pagination: {
                currentPage: page,
                totalPages,
                totalPosts,
                postsPerPage: limit,
                hasNextPage,
                hasPrevPage
            },
            filters: {
                published: published || null,
                authorId: authorId || null
            }
        });
        
    } catch (error) {
        res.status(500).json({
            error: 'Failed to fetch posts',
            details: error.message
        });
    }
});

/**
 * @swagger
 * /api/posts/{id}:
 *   put:
 *     summary: Update a post (only by the author)
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Post ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 example: "Updated Blog Post Title"
 *               content:
 *                 type: string
 *                 example: "Updated content..."
 *               published:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Post updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Post'
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Not authorized to update this post
 *       404:
 *         description: Post not found
 */
// Update a post (with authorization check)
app.put('/api/posts/:id', authenticateToken, validate(updatePostSchema), async (req, res) => {
    try {
        const postId = parseInt(req.params.id);
        const { title, content, published } = req.body;

        // First, check if the post exists and if the user is the author
        const existingPost = await prisma.post.findUnique({
            where: { id: postId }
        });

        if (!existingPost) {
            return res.status(404).json({ error: 'Post not found' });
        }

        if (existingPost.authorId !== req.userId) {
            return res.status(403).json({ error: 'You can only update your own posts' });
        }

        const updatePost = await prisma.post.update({
            where: { id: postId },
            data: {
                title,
                content,
                published
            },
            include: {
                author: {
                    select: { 
                        id: true,
                        username: true,
                        firstName: true,
                        lastName: true
                    }
                }
            }
        });

        res.json(updatePost);
    } catch (error) {
        if (error.code === 'P2025' ){
            return res.status(404).json({ error: 'Post not found' });
        }

        res.status(500).json({
            error: 'Failed to update post',
            details: error.message
        });
    }
});

/**
 * @swagger
 * /api/posts/{id}:
 *   delete:
 *     summary: Delete a post (only by the author)
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Post ID
 *     responses:
 *       200:
 *         description: Post deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Post deleted successfully!"
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Not authorized to delete this post
 *       404:
 *         description: Post not found
 */
// Delete a post (with authorization check)
app.delete('/api/posts/:id', authenticateToken, async (req, res) => {
    try {
        const postId = parseInt(req.params.id);
        
        // First, check if the post exists and if the user is the author
        const existingPost = await prisma.post.findUnique({
            where: { id: postId }
        });

        if (!existingPost) {
            return res.status(404).json({ error: 'Post not found' });
        }

        if (existingPost.authorId !== req.userId) {
            return res.status(403).json({ error: 'You can only delete your own posts' });
        }
        
        await prisma.post.delete({
            where: { id: postId }
        });

        res.json({ message: 'Post deleted successfully!' });

    } catch (error) {
        if(error.code === 'P2025'){
            return res.status(404).json({ error: 'Post not found' });
        }

        res.status(500).json({
            error: 'Failed to delete post',
            details: error.message
        });
    }
});

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - username
 *               - password
 *               - firstName
 *               - lastName
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "john.doe@example.com"
 *               username:
 *                 type: string
 *                 example: "johndoe"
 *               password:
 *                 type: string
 *                 minLength: 6
 *                 example: "securepassword123"
 *               firstName:
 *                 type: string
 *                 example: "John"
 *               lastName:
 *                 type: string
 *                 example: "Doe"
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *                 token:
 *                   type: string
 *       400:
 *         description: Validation error or user already exists
 */
// User Registration (with validation)
app.post('/api/auth/register', authLimiter, validate(registerSchema), async (req, res) => {
    try {
        const { email, username, password, firstName, lastName } = req.body;
        
        // Check if user already exists
        const existingUser = await prisma.user.findFirst({
            where: {
                OR: [
                    { email: email },
                    { username: username }
                ]
            }
        });

        if(existingUser){
            return res.status(400).json({
                error: 'User with this email or username already exists'
            });
        }

        // Hash password
        const hashedPassword = await hashPassword(password);
        
        // Create user
        const newUser = await prisma.user.create({
            data: {
                email,
                username,
                password: hashedPassword,
                firstName,
                lastName
            }
        });

        // Generate token
        const token = generateToken(newUser.id);

        // Return user without password
        const { password: _, ...userWithoutPassword } = newUser;

        res.status(201).json({
            message: 'User registered successfully',
            user: userWithoutPassword,
            token
        });

    } catch (error) {
        res.status(500).json({ 
            error: "Failed to register user",
            details: error.message
        });
    }
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "john.doe@example.com"
 *               password:
 *                 type: string
 *                 example: "securepassword123"
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *                 token:
 *                   type: string
 *       401:
 *         description: Invalid credentials
 */
// User Login (with validation)
app.post('/api/auth/login', authLimiter, validate(loginSchema), async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Find user by email
        const user = await prisma.user.findUnique({
            where: { email: email }
        });
        
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        
        // Check password
        const isPasswordValid = await comparePassword(password, user.password);
        
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        
        // Generate token
        const token = generateToken(user.id);
        
        // Return user without password
        const { password: _, ...userWithoutPassword } = user;
        
        res.json({
            message: 'Login successful',
            user: userWithoutPassword,
            token
        });
        
    } catch (error) {
        res.status(500).json({ 
            error: 'Failed to login',
            details: error.message 
        });
    }
});

/**
 * @swagger
 * /api/auth/profile:
 *   get:
 *     summary: Get current user profile
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401:
 *         description: Authentication required
 *       404:
 *         description: User not found
 */
// Get current user profile (protected route)
app.get('/api/auth/profile', authenticateToken, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.userId },
            select: {
                id: true,
                email: true,
                username: true,
                firstName: true,
                lastName: true,
                createdAt: true,
                updatedAt: true
            }
        });
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json(user);
    } catch (error) {
        res.status(500).json({ 
            error: 'Failed to get profile',
            details: error.message 
        });
    }
});


/**
 * @swagger
 * /api/posts/like:
 *   post:
 *     summary: Toggle like/unlike a post
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - postId
 *               - userId
 *             properties:
 *               postId:
 *                 type: integer
 *                 description: ID of the post to like/unlike
 *                 example: 1
 *               userId:
 *                 type: integer
 *                 description: ID of the user performing the action
 *                 example: 1
 *     responses:
 *       200:
 *         description: Like toggled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 liked:
 *                   type: boolean
 *                   example: true
 *                 likeCount:
 *                   type: integer
 *                   example: 5
 *                 message:
 *                   type: string
 *                   example: "Post liked"
 *       404:
 *         description: Post not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Post not found"
 *       400:
 *         description: Bad Request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Something went wrong"
 *                 details:
 *                   type: string
 *                   example: "Error details"
 */
// Like a post
app.post('/api/posts/like', async (req, res) => {
  try {
    const postId = parseInt(req.body.postId);
    const userId = parseInt(req.body.userId); // Added parseInt for consistency
    
    // Validate input
    if (!postId || !userId) {
      return res.status(400).json({ error: 'postId and userId are required' });
    }
    
    // Check if post exists
    const post = await prisma.post.findUnique({
      where: { id: postId }
    });
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    const existingLike = await prisma.like.findUnique({
      where: {
        userId_postId: {
          userId: userId,
          postId: postId
        }
      }
    });
    
    let liked;
    if (existingLike) {
      // Unlike the post
      await prisma.like.delete({ where: { id: existingLike.id } });
      liked = false;
    } else {
      // Like the post
      await prisma.like.create({ data: { userId: userId, postId: postId } });
      liked = true;
    }
    
    // Get like count
    const likeCount = await prisma.like.count({ where: { postId: postId } });
    
    res.status(200).json({ 
      success: true,
      liked: liked,
      likeCount: likeCount,
      message: liked ? 'Post liked' : 'Post unliked'
    });
  } catch (error) {
    console.error('Like error:', error);
    res.status(400).json({
      error: 'Something went wrong',
      details: error.message
    });
  }
});

/**
 * @swagger
 * /api/posts/{id}/like-status:
 *   get:
 *     summary: Get like status for a post
 *     tags: [Posts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Post ID
 *     responses:
 *       200:
 *         description: Like status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 liked:
 *                   type: boolean
 *                   example: true
 *                 likeCount:
 *                   type: integer
 *                   example: 5
 *       404:
 *         description: Post not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Post not found"
 *       400:
 *         description: Bad Request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Invalid post ID"
 */
// Get like status for a post
app.get('/api/posts/:id/like-status', async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    const userId = req.query.userId ? parseInt(req.query.userId) : null;
    
    if (!postId || isNaN(postId)) {
      return res.status(400).json({ error: 'Valid postId is required' });
    }
    
    // Check if post exists
    const post = await prisma.post.findUnique({
      where: { id: postId }
    });
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    // Get like count
    const likeCount = await prisma.like.count({
      where: { postId: postId }
    });
    
    let liked = false;
    if (userId) {
      const existingLike = await prisma.like.findUnique({
        where: {
          userId_postId: {
            userId: userId,
            postId: postId
          }
        }
      });
      liked = !!existingLike;
    }
    
    res.json({
      liked: liked,
      likeCount: likeCount
    });
  } catch (error) {
    console.error('Get like status error:', error);
    res.status(500).json({
      error: 'Something went wrong',
      details: error.message
    });
  }
});


/**
 * @swagger
 * /api/posts/save:
 *   post:
 *     summary: Toggle save/unsave a post
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - postId
 *               - userId
 *             properties:
 *               postId:
 *                 type: integer
 *                 description: ID of the post to save/unsave
 *                 example: 1
 *               userId:
 *                 type: integer
 *                 description: ID of the user performing the action
 *                 example: 1
 *     responses:
 *       200:
 *         description: Save toggled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 saved:
 *                   type: boolean
 *                   example: true
 *                 saveCount:
 *                   type: integer
 *                   example: 5
 *                 message:
 *                   type: string
 *                   example: "Post saved"
 *       404:
 *         description: Post not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Post not found"
 *       400:
 *         description: Bad Request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Something went wrong"
 *                 details:
 *                   type: string
 *                   example: "Error details"
 */
// Save/Unsave a post
app.post('/api/posts/save', async (req, res) => {
  try {
    const postId = parseInt(req.body.postId);
    const userId = parseInt(req.body.userId);

    if(!postId || !userId){
      return res.status(400).json({ error: 'Post id and user id are required!' });
    }

    const post = await prisma.post.findUnique({
      where: { id: postId }
    })
    if(!post){
      return res.status(404).json({ error: 'Post not found!' });
    }

    const existingSave = await prisma.save.findUnique({
      where: { 
        userId_postId: {
	  userId: userId,
	  postId: postId
	}
      }
    });

    let saved;
    if(existingSave){
      await prisma.save.delete({ where: { id: existingSave.id } });
      saved = false;
    } else {
      await prisma.save.create({ data: { postId: postId, userId: userId } });
      saved = true;
    } 

    // Get save count
    const saveCount = await prisma.save.count({ where: { postId: postId } });

    res.status(200).json({
      success: true,
      saved: saved,
      saveCount: saveCount,
      message: saved ? 'Post saved' : 'Post unsaved'
    });
  } catch (error) {
    res.status(400).json({
      error: 'Something went wrong!',
      message: error.message
    })
  }
})


/**
 * @swagger
 * /api/posts/{id}/save-status:
 *   get:
 *     summary: Get save status for a post
 *     tags: [Posts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Post ID
 *     responses:
 *       200:
 *         description: Save status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 saved:
 *                   type: boolean
 *                   example: true
 *                 saveCount:
 *                   type: integer
 *                   example: 5
 *       404:
 *         description: Post not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Post not found"
 *       400:
 *         description: Bad Request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Invalid post ID"
 */
// Get save status for a post
app.get('/api/posts/:id/save-status', async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    const userId = req.query.userId ? parseInt(req.query.userId) : null;

    if(!postId || isNaN(postId)){ 
      return res.status(400).json({ error: 'Post id is required' });
    } 

    const post = await prisma.post.findUnique({ where: { id: postId } });

    // Check if post exists
    if(!post){ 
      return res.status(404).json({ error: 'Post not found' });
    }

    // get save count
    const saveCount = await prisma.save.count({ where: { postId: postId } });

    let saved = false
    if(userId){
      const existingSave = await prisma.save.findUnique({
	where: {
	  userId_postId: {
	    userId: userId,
	    postId: postId
	  }
	}
      });
      saved = !!existingSave;
    }

    res.json({ saved: saved, saveCount: saveCount }); 
  } catch (error) {
    res.status(400).json({ error: 'Something went wrong', message: error.message });	
  }
});


/**
 * @swagger
 * /api/posts/share:
 *   post:
 *     summary: Share a post
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content: 
 *         application/json:
 *           schema:
 *             type: object
 *             required: 
 *               - postId
 *               - userId
 *             properties:
 *               postId:
 *                 type: integer
 *                 description: ID of the post to share
 *                 example: 1
 *               userId:
 *                 type: integer
 *                 description: ID of the user performing the action
 *                 example: 1
 *     responses:
 *       200:
 *         description: Shared successfully
 *         content: 
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 shared:
 *                   type: boolean
 *                   example: true
 *                 shareCount:
 *                   type: integer
 *                   example: 5
 *                 message: 
 *                   type: string
 *                   example: "Post shared"
 *       400:
 *         description: Bad Request
 *         content: 
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Post id and user id are required"
 *       404:
 *         description: Post not found
 *         content: 
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Post not found"
 */// Share a post
app.post('/api/posts/share', async (req, res) => {
  try {
    const postId = parseInt(req.body.postId);
    const userId = parseInt(req.body.userId);
    if(!postId || !userId){
      return res.status(400).json({ error: 'Post id and user id are required' });
    }

    const post = await prisma.post.findUnique({ where: { id: postId } });
    if(!post){
      return res.status(404).json({ error: 'Post not found' })
    }

    let shared = false;
    if(userId){
      const existingShare = await prisma.share.findUnique({
        where: {
          userId_postId: {
	    userId: userId,
	    postId: postId
	  }
        }
      });
      if(existingShare){ 
	shared = true 
      } else {
       await prisma.share.create({ data: { postId: postId, userId: userId } });
        shared = true
      }
    }

    
    const shareCount = await prisma.share.count({ where: { postId: postId } });

    res.json({ success: true, shared: shared, shareCount: shareCount, message: 'Post shared' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load data', details: error.message });
  }
})


/**
 * @swagger
 * /api/posts/{id}/share-status:
 *   get:
 *     summary: Get share status for a post
 *     tags: [Posts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Post ID
 *     responses:
 *       200:
 *         description: Share status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 saved:
 *                   type: boolean
 *                   example: true
 *                 saveCount:
 *                   type: integer
 *                   example: 5
 *       404:
 *         description: Post not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Post not found"
 *       400:
 *         description: Bad Request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Invalid post ID"
 */
// Get share status for a post
app.get('/api/posts/:id/share-status', async (req, res) => {
  try {
    const postId = parseInt(req.params.id)
    const userId = req.query.userId ? parseInt(req.query.userId) : null
    if(!postId || isNaN(postId)){
      return res.status(400).json({ error: 'Post id is required' });
    } 

    const post = await prisma.post.findUnique({ where: { id: postId } });
    if(!post){
      return res.status(404).json({ error: 'Post not found' });
    }

    let shared = false;
    if(userId){
      const existShare = await prisma.share.findUnique({ 
        where: {
          userId_postId: {
	    postId: postId,
	    userId: userId,
	  }
        }
      });
      if(existShare){
	shared = true
      }
    }

    const shareCount = await prisma.share.count({ where: { postId: postId } });

    res.json({ success: true, shared: shared, shareCount: shareCount });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load data', details: error.message });
  }
})


// write a comment
app.post('/api/posts/comment', async (req, res) => {
  try {
    const postId = parseInt(req.body.postId)
    if(!postId || isNaN(postId)){
      return res.status(400).json({ error: 'Post id is required' });
    }

    const userId = parseInt(req.body.userId)
    if(!userId || isNaN(userId)){
      return res.status(400).json({ error: 'User id is required' });
    }

    const post = await prisma.post.findUnique({ where: { id: postId } });
    if(!post){
      return res.status(404).json({ error: 'Post not found' });
    }

    const comment = await prisma.comment.create({
      data: { 
        content: req.body.content,
	userId: userId,
	postId: postId
      },
      include: {
	user: {
	  select: {
	    id: true,
	    username: true,
	    firstName: true,
	    lastName: true
	  }
	}
      }
    });

    res.status(201).json(comment);
  } catch (error) {
    res.status(500).json({ error: 'Server error', details: error.message })	
  }
})


// get comments by post id
app.get('/api/posts/:id/comments', async (req, res) => {
  try {
    const postId = parseInt(req.params.id)
    if(!postId || isNaN(postId)){
      return res.status(400).json({ error: 'Post id is required' });
    }

    const userId = parseInt(req.query.userId)
    if(!userId || isNaN(userId)){
      return res.status(400).json({ error: 'User id is required' });
    }

    const comments = await prisma.comment.findMany({ 
      where: { postId: postId },
      include: { user: true } 
    });

    const commentCount = await prisma.comment.count({ where: { postId: postId } })

    res.status(200).json({ 
      success: true, 
      comments: comments, 
      commentCount: commentCount, 
      message: 'Succesfully loaded'
    })
  } catch (error) {
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});





// 404 handler for undefined routes
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`API Documentation available at http://localhost:${PORT}/api-docs`);
});
