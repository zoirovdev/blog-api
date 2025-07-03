const rateLimit = require('express-rate-limit');

// General API rate limit
const generalLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // Limit each IP to 100 requests per windowMs
    message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Strict rate limit for auth endpoints
const authLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 5, // Limit each IP to 5 auth requests per windowMs
    message: {
        error: 'Too many authentication attempts, please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Moderate rate limit for post creation
const createPostLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.POST_RATE_LIMIT_MAX) || 10, // Limit each IP to 10 post creations per windowMs
    message: {
        error: 'Too many posts created, please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Global error handler
const errorHandler = (err, req, res, next) => {
    console.error('Global error handler:', err);
    
    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: 'Invalid token' });
    }
    
    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired' });
    }
    
    // Prisma errors
    if (err.code === 'P2002') {
        return res.status(400).json({ error: 'A record with this data already exists' });
    }
    
    if (err.code === 'P2025') {
        return res.status(404).json({ error: 'Record not found' });
    }
    
    // Validation errors
    if (err.name === 'ValidationError') {
        return res.status(400).json({ 
            error: 'Validation failed',
            details: err.details 
        });
    }
    
    // Default server error
    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
};

// Request logging middleware
const requestLogger = (req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} - ${req.method} ${req.path} - IP: ${req.ip}`);
    next();
};

// 404 handler
const notFoundHandler = (req, res) => {
    res.status(404).json({ 
        error: 'Endpoint not found',
        message: `Cannot ${req.method} ${req.path}`,
        availableEndpoints: [
            'GET /api/posts',
            'GET /api/posts/:id',
            'GET /api/posts/search',
            'POST /api/posts',
            'PUT /api/posts/:id',
            'DELETE /api/posts/:id',
            'GET /api/users',
            'POST /api/auth/register',
            'POST /api/auth/login',
            'GET /api/auth/profile'
        ]
    });
};

module.exports = {
    generalLimiter,
    authLimiter,
    createPostLimiter,
    errorHandler,
    requestLogger,
    notFoundHandler
};
