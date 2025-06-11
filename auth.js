// auth.js

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');


// Secret key for JWT (in production, use environment variables)
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production-12345';


// Hash password
const hashPassword = async (password) => {
    const saltRounds = 10;
    return await bcrypt.hash(password, saltRounds);
};


// Compare password
const comparePassword = async (password, hashedPassword) => {
    return await bcrypt.compare(password, hashedPassword);
};


// Generate JWT Token
const generateToken = (userId) => {
    return jwt.sign({ userId }, JWT_SECRET, {expiresIn: '24h'});
};


// Verify JWT Token
const verifyToken = (token) => {
    return jwt.verify(token, JWT_SECRET);
};


// Middleware to protect routes
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer Token

    if(!token) {
	return res.status(401).json({ error: 'Access token required' });
    }


    try {
	const decoded = verifyToken(token);
	req.userId = decoded.userId;
	next();
    } catch (error) {
	return res.status(403).json({ error: 'Invalid or expired token' });
    }
};


module.exports = {
    hashPassword,
    comparePassword,
    generateToken,
    verifyToken,
    authenticateToken
};
