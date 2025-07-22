// server.js

require('dotenv').config();

const express = require('express');
const cors = require('cors');


const { generalLimiter, errorHandler, requestLogger, notFoundHandler } = require('./middleware.js');
const { specs, swaggerUi } = require('./swagger');

const app = express();
const userRoutes = require('./routes/userRoutes.js')
const postRoutes = require('./routes/postRoutes.js')
const PORT = process.env.PORT || 8000;



app.use(cors()); // Apply CORS middleware
app.use(express.json()); // Middleware to parse JSON bodies
app.use(requestLogger); // Log all requests
app.use(generalLimiter); // Apply general rate limiting to all routes


app.use('/api/users', userRoutes)
app.use('/api/posts', postRoutes)

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




// error handlers
app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`API Documentation available at http://localhost:${PORT}/api-docs`);
});
