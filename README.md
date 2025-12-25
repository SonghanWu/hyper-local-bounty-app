# Hyper-local Bounty App

A location-based task marketplace where users can post tasks with rewards and nearby users can accept and complete them.

## Tech Stack

- **Backend**: NestJS + TypeScript
- **Database**: PostgreSQL with PostGIS
- **Cache**: Redis
- **Real-time**: Socket.io
- **Mobile**: React Native (Expo)

## Project Structure

```
├── backend/          # NestJS backend API
├── mobile/           # React Native app (coming soon)
└── development_plan.md
```

## Getting Started

### Prerequisites

- Node.js 18+
- Docker & Docker Compose

### Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Start database services (PostgreSQL + Redis)
docker-compose up -d

# Start development server
npm run start:dev
```

The API will be available at `http://localhost:3000`

### Available Endpoints

- `GET /` - Welcome message
- `GET /health` - Health check

## Development Status

Currently in Phase 1: Infrastructure & Authentication setup

## License

MIT
