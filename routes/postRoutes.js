const express = require('express');
const router = express.Router();
const { validate, createPostSchema, updatePostSchema } = require('../validation');
const { authenticateToken } = require('../auth');
const { createPostLimiter } = require('../middleware');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();






// Get all posts with pagination
router.get('/', async (req, res) => {
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



// Advanced search endpoint
router.get('/search', authenticateToken, async (req, res) => {
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



// Get a specific post by id
router.get('/:id', async (req, res) => {
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



// Create a new post (PROTECTED with validation)
router.post('/', createPostLimiter, authenticateToken, validate(createPostSchema), async (req, res) => {
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



// Update a post (with authorization check)
router.put('/:id', authenticateToken, validate(updatePostSchema), async (req, res) => {
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



// Delete a post (with authorization check)
router.delete('/:id', authenticateToken, async (req, res) => {
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



// Like a post
router.post('/like', async (req, res) => {
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



// Get like status for a post
router.get('/:id/like-status', async (req, res) => {
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


// Save/Unsave a post
router.post('/save', async (req, res) => {
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


// Get save status for a post
router.get('/:id/save-status', async (req, res) => {
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



// Share a post
router.post('/share', async (req, res) => {
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


// Get share status for a post
router.get('/:id/share-status', async (req, res) => {
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
router.post('/comment', async (req, res) => {
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
router.get('/:id/comments', async (req, res) => {
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



// create a read model that clarify post is read or not
router.post('/read', async (req, res) => {
  try {
    const postId = parseInt(req.body.postId)
    if(!postId){
      res.status(400).json({ error: 'Post id is required' });
      return
    }

    const userId = parseInt(req.body.userId)
    if(!userId){
      res.status(400).json({ error: 'User id is required' });
      return
    }

    const post = await prisma.post.findUnique({ where: { id: postId } })
    if(!post){
      res.status(404).json({ error: 'Post not found' });
      return
    }

    // Use upsert to handle the unique constraint safely
    await prisma.read.upsert({
      where: {
        userId_postId: {  // Compound unique key
          userId: userId,
          postId: postId
        }
      },
      update: {
        // Optionally update timestamp
        createdAt: new Date()
      },
      create: {
        userId: userId,
        postId: postId
      }
    })

    const readCount = await prisma.read.count({ where: { postId: postId } })

    res.status(200).json({ readCount: readCount, success: true })
  } catch (error) {
    res.status(500).json({ error: 'Server error', details: error.message })
  }
})


// get how many users read post
router.get('/:id/read', async (req, res) => {
  try {
    const postId = parseInt(req.params.id)
    if(!postId){
      res.status(400).json({ error: 'Post id is not valid' });
      return
    }

    const post = await prisma.post.findFirst({ where: { id: postId } });
    if(!post){
      res.status(404).json({ error: 'Post not found' });
      return
    }

    const readCount = await prisma.read.count({ where: { postId: postId } });
    
    res.status(200).json({ readCount: readCount, success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error', details: error.message })
  }
})





module.exports = router
