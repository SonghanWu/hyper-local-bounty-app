# Hyper-local Bounty App - Backend

NestJS backend API for the hyper-local bounty application.

## Prerequisites

- Node.js (v18 or higher)
- Docker and Docker Compose
- npm or yarn

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Database Services

Start PostgreSQL (with PostGIS) and Redis using Docker Compose:

```bash
docker-compose up -d
```

Verify services are running:

```bash
docker-compose ps
```

### 3. Configure Environment

Copy `.env.example` to `.env` and update if needed:

```bash
cp .env.example .env
```

### 4. Start Development Server

```bash
npm run start:dev
```

The server will start on `http://localhost:3000`

## Available Scripts

- `npm run start` - Start production server
- `npm run start:dev` - Start development server with hot reload
- `npm run start:debug` - Start server in debug mode
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm run test` - Run unit tests
- `npm run test:e2e` - Run end-to-end tests

## Database Migrations

- `npm run migration:generate` - Generate a new migration
- `npm run migration:run` - Run pending migrations
- `npm run migration:revert` - Revert last migration

## API Endpoints

- `GET /` - Welcome message
- `GET /health` - Health check

## Docker Services

### PostgreSQL with PostGIS
- **Host:** localhost
- **Port:** 5432
- **Database:** bounty_db
- **Username:** bounty_user
- **Password:** bounty_password

### Redis
- **Host:** localhost
- **Port:** 6379

## Stop Services

```bash
docker-compose down
```

To remove volumes as well:

```bash
docker-compose down -v
```
