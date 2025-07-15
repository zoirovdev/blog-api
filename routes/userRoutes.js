const express = require('express');
const router = express.Router();
const { validate, registerSchema, loginSchema } = require('../validation');
const { hashPassword, comparePassword, generateToken, authenticateToken } = require('../auth');
const { authLimiter } = require('../middleware');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();


router.get('/', (req, res) => {
  res.json({ message: 'User Route is working!' })
})


router.post('/register', authLimiter, validate(registerSchema), async (req, res) => {
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
})


router.post('/login', authLimiter, validate(loginSchema), async (req, res) => {
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
})


router.get('/profile', authenticateToken, async (req, res) => {
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
})



// Get all posts by a specific user
router.get('/posts', async (req, res) => {
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



router.get('/:username', authenticateToken, async (req, res) => {
    try {
        const username = req.params.username
        if(!username){
            return res.status(400).json({ error: 'Username required' })
        }

        const user = await prisma.user.findUnique({
            where: { username: username },
            select: {
                id: true,
	        username: true,
	        firstName: true,
	        lastName: true,
	        createdAt: true,
	        email: true
            }
        })

        if(!user){
            return res.status(404).json({ error: 'User not found' })
        }

        res.status(200).json(user)
    } catch (error) {
        res.status(500).json({ error: 'Server error', details: error.message })
    }
})


// update user's firstname and lastname
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const userId = parseInt(req.params.id)
        const firstName = req.body.firstName
        const lastName = req.body.lastName
        if(!userId || !firstName || !lastName){  
            return res.status(400).json({ error: 'User id is required' });
        }

        const user = await prisma.user.update({ 
            where: { id: userId },
            data: {
	        firstName,
	        lastName
            }
        })
    
        res.status(200).json(user)
    } catch (error) {
        if(error.code === 'P2025'){
            return res.status(404).json({ error: 'User not found' });
        }

        res.status(500).json({ error: 'Server error', details: error.message })
    }
})


// get user liked posts
router.get('/:userId/liked-posts', authenticateToken, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId)
    if(!userId){
      return res.status(400).json({ error: 'User id is required' });
    }

    const likes = await prisma.like.findMany({
      where: { userId: userId },
      select: {
        post: {
          select: {
            id: true,
	    createdAt: true,
	    author: true,
            title: true,
            content: true
          }
        }
      }
    })
    const posts = likes.map(like => like.post)

    res.status(200).json([posts])
  } catch (error) {
    res.status(500).json({ error: 'Server error', details: error.message });
  }
})


// get user saved posts
router.get('/:userId/saved-posts', authenticateToken, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId)
    if(!userId){
      return res.status(400).json({ error: 'User id is required' });
    }

    const saved = await prisma.save.findMany({
      where: { userId: userId },
      select: {
        post: {
	  select: {
            id: true,
	    author: true,
	    createdAt: true,
	    title: true,
	    content: true
	  }
	}
      }
    })

    const posts = saved.map(save => save.post)

    res.status(200).json(posts)
  } catch (error) {
    res.status(500).json({ error: 'Server error', details: error.message });
  }
})


// get user shared posts
router.get('/:userId/shared-posts', authenticateToken, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId)
    if(!userId){
      return res.status(400).json({ error: 'User id is required' }) 
    }

    const shared = await prisma.share.findMany({
      where: { userId: userId },
      select: {
        post: {
          select: {
            id: true,
	    author: true,
	    createdAt: true,
	    title: true,
	    content: true
	  }
	}
      }
    })

    const posts = shared.map(share => share.post)
    
    res.status(200).json(posts)
  } catch (error){
    res.status(500).json({ error: 'Server error', details: error.message });
  }
})


// get user commented posts
router.get('/:userId/commented-posts', authenticateToken, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId)
    if(!userId){
      return res.status(400).json({ error: 'User id required' })
    }

    const commented = await prisma.comment.findMany({
      where: { userId: userId },
      select: {
        post: {
          select: {
            id: true,
	    author: true,
	    createdAt: true,
	    title: true,
	    content: true
	  }
	}
      }
    })

    const uniquePosts = commented.map(com => com.post)
        .filter((post, index, array) => array.findIndex(p => p.id === post.id) === index)

    res.status(200).json(uniquePosts)
  } catch (error) {
    res.status(500).json({ error: 'Server error', details: error.message });
  }
})    



// get user read posts
router.get('/:userId/read-posts', authenticateToken, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId)
    if(!userId){
      return res.status(400).json({ error: 'User id required' })
    }

    const reads = await prisma.read.findMany({
      where: { userId: userId },
      select: {
        post: {
          select: {
            id: true,
	    author: true,
	    createdAt: true,
	    title: true,
	    content: true
	  }
	}
      }
    })

    const posts = reads.map(read => read.post)

    res.status(200).json(posts)
  } catch (error){
    res.status(500).json({ error: 'Server error', details: error.message })
  }
})



// get account posts
router.get('/:username/posts', authenticateToken, async (req, res) => {
  try {
    const username = req.params.username
    if(!username){
      return res.status(400).json({ error: 'Username required' })
    }

    const user = await prisma.user.findUnique({ where: { username: username } })
    if(!user){
      return res.status(404).json({ error: 'User not found' })
    }

    const posts = await prisma.post.findMany({
      where: { authorId: user.id },
      include: {
        author: {
	  select: {
            id: true,
	    firstName: true,
	    lastName: true,
	    username: true,
	    createdAt: true
	  }
	}
      }
    })

    res.status(200).json(posts)
  } catch (error) {
    res.status(500).json({ error: "Server error", details: error.message })
  }
})



module.exports = router
