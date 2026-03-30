# FreelanceFlow API

FreelanceFlow SaaS Backend - A NestJS API for French-market freelance invoicing management.

## 🚀 Features

- **Authentication**: JWT-based auth with secure password hashing
- **Client Management**: CRUD operations for client directory
- **Service Catalog**: Manage reusable services with hourly rates
- **Invoice System**: Create invoices with HT/VAT/TTC calculations
- **PDF Generation**: Server-side PDF generation from persisted data
- **French Compliance**: EUR currency, French VAT rules, GDPR-aware
- **Tenant Isolation**: Multi-user SaaS with strict data separation

## 🛠️ Tech Stack

- **Framework**: NestJS 11.x
- **Language**: TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT + Passport
- **Validation**: Class-validator + Class-transformer
- **Documentation**: Swagger/OpenAPI
- **Testing**: Jest
- **Containerization**: Docker

## 📋 Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm or yarn

## 🔧 Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd backend
```

2. **Install dependencies**
```bash
npm install
```

3. **Environment setup**
```bash
cp .env.example .env
# Edit .env with your database credentials and JWT secret
```

4. **Database setup**
```bash
npm run prisma:migrate
npm run prisma:generate
```

## 🏃‍♂️ Running the Application

### Development
```bash
npm run start:dev
```

### Production
```bash
npm run build
npm run start:prod
```

### Docker
```bash
docker build -t freelanceflow-api .
docker run -p 3001:3001 freelanceflow-api
```

## 📚 API Documentation

Once the application is running, visit:
- **Swagger UI**: http://localhost:3001/api/docs
- **API Base URL**: http://localhost:3001/api/v1

## 🧪 Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## 📁 Project Structure

```
src/
├── common/                 # Shared utilities
│   ├── filters/           # Exception filters
│   ├── guards/            # Auth guards
│   ├── interceptors/      # Request/response interceptors  
│   └── pipes/             # Validation pipes
├── modules/               # Feature modules
│   ├── auth/             # Authentication
│   ├── users/            # User management & profiles
│   ├── clients/          # Client directory
│   ├── services/         # Service catalog (prestations)
│   ├── invoices/         # Invoice management
│   └── pdf/              # PDF generation
├── prisma/               # Database schema & migrations
└── test/                 # E2E tests
```

## 🔐 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | API port | `3001` |
| `NODE_ENV` | Environment | `development` |
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `JWT_SECRET` | JWT signing secret | Required |
| `JWT_EXPIRES_IN` | JWT expiration | `1d` |
| `FRONTEND_URL` | Frontend URL for CORS | `http://localhost:3000` |

## 🏗️ Architecture

### Tenant Isolation
Every domain entity (clients, services, invoices) includes a `userId` field ensuring strict data separation between freelancer accounts.

### Money Handling
- All monetary values stored as `Decimal` types (never float)
- HT/VAT/TTC calculations handled server-side
- EUR currency enforced throughout

### Security
- JWT tokens with configurable expiration
- Password hashing with bcrypt (12 rounds)
- CORS configured for specific frontend origins
- Input validation on all endpoints
- SQL injection protection via Prisma

## 🚢 Deployment

The application is designed for containerized deployment with:
- Health checks
- Non-root user execution
- Multi-stage Docker builds
- Environment-based configuration

## 👥 Team

- **Backend**: NestJS API development
- **Frontend**: Next.js integration
- **DevOps**: Container orchestration & CI/CD

## 📄 License

MIT

## 🔗 Related

- [Frontend Repository](../frontend)
- [Project Documentation](../docs)
- [Database Schema](../docs/database-schema.md)
