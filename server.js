// server.js

require('dotenv').config();


const express = require('express');
const prisma = require('./db.js');

const app = express();
const PORT = 8000;

// Middleware to parse JSON bodies
app.use(express.json());

// Test route
app.get('/', (req, res) => {
    res.json({ message: 'Blog API with Prisma is working!' });
});

// Get all users
app.get('/api/users', async (req, res) => {
    try {
        console.log('Trying to fetch users...');
        const users = await prisma.user.findMany();
        console.log('Found users:', users);
        res.json(users);
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch users!',
            details: error.message 
        });
    }
});

// Create a new user
app.post('/api/users', async (req, res) => {
    try {
        console.log('Trying to create user with data:', req.body);
        const { email, username, password, firstName, lastName } = req.body;
        
        const newUser = await prisma.user.create({
            data: {
                email,
                username,
                password,
                firstName,
                lastName
            }
        });
        console.log('Created user:', newUser);
        res.status(201).json(newUser);
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({ 
            error: 'Failed to create user',
            details: error.message 
        });
    }
});


// Get all posts (with author information)
app.get('/api/posts', async (req, res) => {
    try {
	console.log('Fetching all posts...');
	const posts = await prisma.post.findMany({
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
	res.json(posts);
    } catch (error) {
	console.error('Fetch posts error: ', error);
	res.status(500).json({
	    error: 'Failed to fetch posts',
	    details: error.message
	});
    }
});


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
        console.error('Fetch post error:', error);
	res.status(500).json({
	    error: 'Failed to fetch post',
	    details: error.message
	});
    }
});


// Create a new post
app.post('/api/posts', async (req, res) => {
    try {
	console.log('Creating a post with data: ', req.body);
	const { title, content, authorId, published = false } = req.body;
	
	// Check if author exists
	const author = await prisma.user.findUnique({ 
	    where: { id: parseInt(authorId) }
	});
	
	if (!author){
	    return res.status(400).json({ error: 'Author not found' });
	}
	
	const newPost = await prisma.post.create({
	    data: {
	        title,
		content,
		published,
		authorId: parseInt(authorId)
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
	console.error('Create post error:', error);
	res.status(500).json({ 
	    error: 'Failed to create post',
	    details: error.message
	});
    }
});


// Get all posts by a specific user
app.get('/api/users/:id/posts', async (req, res) => {
    try {
	const userId = parseInt(req.params.id);
	const posts = await prisma.post.findMany({
	    where: { authorId: userId },
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
	res.json(posts);
    } catch (error) {
	console.error('Fetch user posts error: ', error);
	res.status(500).json({
	    error: 'Failed to fetch user posts',
	    details: error.message
	});
    }
});


// Update a user
app.put('/api/users/:id', async (req, res) => {
    try {
	const userId = parseInt(req.params.id);
	const { username, email, firstName, lastName } = req.body;

	const updateUser = await prisma.user.update({
	    where: { id: userId },
	    data: {
	        email,
		username, 
		firstName, 
		lastName
	    }
	});

	res.json(updateUser);
    } catch  (error) {
	console.error('Update user error: ', error);
	if (error.code === 'P2025'){
	    return res.status(404).json({ error: 'User not found' });
	}
	
	res.status(500).json({
	    error: 'Failed to update user',
	    edtails: error.message
	});

    }
});


// Delete a user
app.delete('/api/users/:id', async (req, res) => {
    try {
	const userId = parseInt(req.params.id);

	// delete all posts by this user
	await prisma.post.deleteMany({
	    where: { authorId: userId }
	});

	// delete a user
	await prisma.user.delete({
	    where: { id: userId }
	});

	res.json({ message: "User and all their posts deleted successfully!" });
    } catch (error) {
	console.error('Delete user error: ', error);
	if ( error.code === 'P2025' ){
	    return res.status(404).json({ error: 'User not found' });
	}

	res.status(500).json({ 
	    error: "Failed to delete user",
	    details: error.message
	});

    }
});


// Update a post
app.put('/api/posts/:id', async (req, res) => {
    try {
	const postId = parseInt(req.params.id);
	const { title, content, published } = req.body;

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
	console.error('Update post error: ', error);
	if (error.code === 'P2025' ){
	    return res.status(404).json({ error: 'Post not found' });
	}

	res.status(500).json({
	    error: 'Failed to update post',
	    details: error.message
	});
    }
});


// Delete a post
app.delete('/api/posts/:id', async (req, res) => {
    try {
	const postId = parseInt(req.params.id);
	
	await prisma.post.delete({
	    where: { id: postId }
	});

	res.json({ message: 'Post deleted successfully!' });

    } catch (error) {
	console.error('Delete post error: ', error);
	if(error.code === 'P2025'){
	    return res.status(404).json({ error: 'Post not found' });
	}

	res.status(500).json({
	    error: 'Failed to delete post',
	    details: error.message
	});
    }
});


app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
