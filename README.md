# Blog API

A comprehensive RESTful blog API built with Node.js, Express, Prisma, and PostgreSQL featuring authentication, rate limiting, and comprehensive CRUD operations.

## Features

- 🔐 JWT-based authentication
- 📝 Full CRUD operations for blog posts
- 👥 User management system
- 🛡️ Rate limiting and security middleware
- 📊 API documentation with Swagger
- 🗄️ PostgreSQL database with Prisma ORM
- 🐳 Docker support
- ✅ Health checks
- 🧪 Testing setup

## Getting Started

### Prerequisites

- Node.js 18.0.0 or higher
- PostgreSQL database
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/blog-api.git
cd blog-api
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Set up the database:
```bash
npm run migrate
```

5. Start the development server:
```bash
npm run dev
```

## Environment Variables

Create a `.env` file with the following variables:

```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/blog_api_db?schema=public"

# JWT Configuration
JWT_SECRET="your-256-bit-secret-key"
JWT_EXPIRES_IN="24h"

# Server Configuration
PORT=8000
NODE_ENV="development"

# CORS Configuration
CORS_ORIGIN="http://localhost:5173"
CORS_METHODS="GET,POST,PUT,DELETE,OPTIONS"
CORS_ALLOWED_HEADERS="Content-Type,Authorization"

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=10000
AUTH_RATE_LIMIT_MAX=500
POST_RATE_LIMIT_MAX=1000

# API Information
API_VERSION="1.0.0"
API_TITLE="Blog API"
API_DESCRIPTION="A comprehensive blog API with authentication"
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/profile` - Get user profile (protected)

### Posts
- `GET /api/posts` - Get all posts
- `GET /api/posts/:id` - Get post by ID
- `GET /api/posts/search` - Search posts
- `POST /api/posts` - Create new post (protected)
- `PUT /api/posts/:id` - Update post (protected)
- `DELETE /api/posts/:id` - Delete post (protected)

### Users
- `GET /api/users` - Get all users (protected)

### Health
- `GET /health` - Health check endpoint

## Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server
- `npm run build` - Generate Prisma client
- `npm run migrate` - Deploy database migrations
- `npm run migrate:dev` - Run development migrations
- `npm test` - Run tests
- `npm run lint` - Run ESLint
- `npm run health-check` - Check server health

## Docker

Build and run with Docker:

```bash
# Build image
npm run docker:build

# Run container
npm run docker:run
```

Or use Docker Compose:

```bash
docker-compose up -d
```

## Testing

Run the test suite:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## Production Deployment

1. Set environment variables for production
2. Run database migrations:
   ```bash
   npm run migrate
   ```
3. Start the server:
   ```bash
   npm start
   ```

## Rate Limiting

The API implements multiple layers of rate limiting:

- **General API**: 10,000 requests per 15 minutes
- **Authentication**: 500 requests per 15 minutes
- **Post Creation**: 1,000 requests per 15 minutes

## Security Features

- JWT token authentication
- Password hashing with bcrypt
- Rate limiting
- CORS protection
- Input validation
- Error handling without information leakage

## API Documentation

Once the server is running, visit:
- Swagger UI: `http://localhost:8000/api-docs`
- Health Check: `http://localhost:8000/health`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite
6. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

If you encounter any issues or have questions, please file an issue on the [GitHub repository](https://github.com/yourusername/blog-api/issues).
