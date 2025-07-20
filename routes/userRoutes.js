const express = require('express');
const router = express.Router();
const { validate, registerSchema, loginSchema } = require('../validation');
const { hashPassword, comparePassword, generateToken, authenticateToken } = require('../auth');
const { authLimiter } = require('../middleware');
const { PrismaClient } = require('@prisma/client');
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
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
                updatedAt: true,
		avatar: true
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
	        email: true,
		avatar: true
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



const uploadsDir = './uploads/profiles';
if(!fs.existsSync(uploadsDir)){
    fs.mkdirSync(uploadsDir, { recursive: true })
}


// Configure multer for profile image storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + randomBytes(6).toString('hex')
	const fileExtension = path.extname(file.originalname);
	cb(null, `profile-${req.user.userId}-${uniqueSuffix}${fileExtension}`);
    }
})



// file filter for images only
const fileFilter = (req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

    if(allowedMimeTypes.includes(file.mimetype)){
        cb(null, true)
    } else {
        cb(new Error('Invalid file type. Only JPEG, JPG, PNG and WEBP images are allowed.'), false)
    }
}



// configure multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB limit for profile images
  }
});



// Helper function to delete old profile image file
const deleteImageFile = (filename) => {
  if (filename) {
    const filePath = path.join(uploadsDir, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
};





// 1. Upload/Update Profile Image API
router.post('/upload', authenticateToken, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No profile image provided'
      });
    }

    const userId = req.user.userId;

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, avatar: true }
    });

    if (!user) {
      // Delete uploaded file if user doesn't exist
      deleteImageFile(req.file.filename);
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Delete old profile image if exists
    if (user.avatar) {
      deleteImageFile(user.avatar);
    }

    // Update user with new profile image
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        avatar: req.file.filename,
        updatedAt: new Date()
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        updatedAt: true
      }
    });

    res.status(200).json({
      success: true,
      message: 'Profile image uploaded successfully',
      data: {
        user: updatedUser,
        imageUrl: `${req.protocol}://${req.get('host')}/api/profile/image/${updatedUser.id}`
      }
    });

  } catch (error) {
    // Delete uploaded file on error
    if (req.file) {
      deleteImageFile(req.file.filename);
    }
    
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during upload',
      error: error.message
    });
  }
});



// delete profile image api
router.delete('/image', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get user with current profile image
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, avatar: true }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!user.avatar) {
      return res.status(404).json({
        success: false,
        message: 'No profile image to delete'
      });
    }

    // Delete file from storage
    deleteImageFile(user.avatar);

    // Update database to remove profile image reference
    await prisma.user.update({
      where: { id: userId },
      data: {
        avatar: null,
        updatedAt: new Date()
      }
    });

    res.status(200).json({
      success: true,
      message: 'Profile image deleted successfully'
    });

  } catch (error) {
    console.error('Delete image error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting image',
      error: error.message
    });
  }
});




module.exports = router
