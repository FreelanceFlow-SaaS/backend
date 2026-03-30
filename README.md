# FreelanceFlow Backend API

Enterprise-grade NestJS backend API for French freelance invoicing SaaS platform.

## Tech Stack

### Core Framework
- **NestJS** - Progressive Node.js framework with TypeScript
- **TypeScript** - Type-safe JavaScript development
- **Node.js** - JavaScript runtime environment

### Database & ORM
- **Neon PostgreSQL** - Serverless PostgreSQL database
- **Prisma ORM** - Next-generation database toolkit
- **Database Migrations** - Automated schema management

### Authentication & Security
- **JWT (JSON Web Tokens)** - Stateless authentication
- **HttpOnly Cookies** - XSS-resistant token storage
- **Refresh Token Rotation** - Enhanced security pattern
- **bcryptjs** - Password hashing
- **Passport.js** - Authentication middleware

### API & Documentation
- **Swagger/OpenAPI** - Interactive API documentation
- **Class Validator** - Request validation with French error messages
- **Class Transformer** - Data transformation and serialization

### Code Quality & DevOps
- **ESLint** - TypeScript linting with custom rules
- **Prettier** - Code formatting
- **Husky** - Git hooks for pre-commit quality checks
- **Jest** - Testing framework
- **Docker** - Containerization for production deployment

### Architecture Patterns
- **Modular Architecture** - Domain-driven design with feature modules
- **Golden Rule API Design** - Liberal in accepting, conservative in sending
- **Dependency Injection** - NestJS IoC container
- **Global Exception Filters** - Centralized error handling

## Project Structure

```
src/
├── main.ts                 # Application bootstrap
├── app.module.ts           # Root application module
├── common/                 # Shared utilities and infrastructure
│   ├── prisma/            # Database service (global module)
│   ├── filters/           # Global exception filters
│   └── interceptors/      # Response transformation
└── modules/               # Feature-based modules
    ├── auth/              # JWT authentication & authorization
    ├── users/             # User management & freelancer profiles
    ├── clients/           # Client directory management
    ├── services/          # Service catalog (prestations)
    ├── invoices/          # Invoice creation & management
    └── pdf/               # PDF generation for invoices
```

## Database Schema

The application uses 8 PostgreSQL tables with proper relations:

- **users** - Authentication and tenant boundary
- **freelancer_profiles** - Seller information for invoices
- **clients** - Client directory per user
- **services** - Reusable service catalog with hourly rates
- **invoices** - Invoice headers with computed totals
- **invoice_lines** - Line items with VAT calculations
- **invoice_status_events** - Audit trail for status changes
- **refresh_tokens** - Secure JWT refresh token storage

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL database (or Neon account)

### Installation

1. Clone the repository
```bash
git clone https://github.com/FreelanceFlow-SaaS/backend.git
cd backend
```

2. Install dependencies
```bash
npm install
```

3. Setup environment variables
```bash
cp .env.example .env
# Update DATABASE_URL with your PostgreSQL connection string
# Update JWT_SECRET with a secure random string
```

4. Run database migrations
```bash
npm run prisma:migrate
```

5. Start development server
```bash
npm run start:dev
```

The API will be available at `http://localhost:3001`

### API Documentation

Interactive API documentation is available at:
- **Swagger UI**: `http://localhost:3001/api/docs`

## Available Scripts

### Development
- `npm run start:dev` - Start development server with hot reload
- `npm run start:debug` - Start with debug mode enabled

### Building
- `npm run build` - Build the application for production
- `npm run start:prod` - Start production server

### Database
- `npm run prisma:generate` - Generate Prisma client
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:studio` - Open Prisma Studio database GUI

### Code Quality
- `npm run lint` - Run ESLint with auto-fix
- `npm run format` - Format code with Prettier
- `npm run test` - Run unit tests
- `npm run test:e2e` - Run end-to-end tests

## Authentication Flow

The API implements a secure JWT-based authentication system:

1. **Registration/Login** - Returns access token (15min) and sets refresh token cookie (7 days)
2. **API Access** - Use access token in Authorization header or HttpOnly cookie
3. **Token Refresh** - Automatic refresh using HttpOnly refresh token
4. **Logout** - Revokes refresh tokens and clears cookies

## Environment Variables

Required environment variables (see `.env.example`):

```bash
# Application
PORT=3001
NODE_ENV=development

# Database
DATABASE_URL="postgresql://username:password@host:port/database"

# JWT Configuration
JWT_SECRET="your-secure-secret-key"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

# CORS
FRONTEND_URL="http://localhost:3000"
```

## Docker Deployment

Build and run with Docker:

```bash
# Build image
docker build -t freelanceflow-api .

# Run container
docker run -p 3001:3001 --env-file .env freelanceflow-api
```

## Contributing

This project uses conventional commits and has automated quality checks:

1. **Commit Format**: `type(scope): description`
   - Examples: `feat: add user authentication`, `fix(auth): resolve token expiration`

2. **Pre-commit Hooks**: Automatically run on every commit
   - ESLint validation and auto-fix
   - Prettier code formatting
   - Related unit tests

3. **Pre-push Hooks**: Run full test suite and build verification

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - User registration
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/refresh` - Token refresh
- `POST /api/v1/auth/logout` - User logout

### Users & Profiles
- `GET /api/v1/users/profile` - Get freelancer profile
- `PATCH /api/v1/users/profile` - Update freelancer profile

### Feature Modules (Ready for Implementation)
- `/api/v1/clients/*` - Client management
- `/api/v1/services/*` - Service catalog
- `/api/v1/invoices/*` - Invoice management with French VAT
- `/api/v1/pdf/*` - PDF generation

## French Business Compliance

The API is designed for the French market with:

- **EUR currency** enforcement throughout
- **HT/VAT/TTC calculations** for proper French invoicing
- **French error messages** for better user experience
- **Decimal precision** for monetary amounts (no floating point)

## License

This project is proprietary software for FreelanceFlow SaaS platform.

## Support

For technical questions or issues, please contact the development team.
