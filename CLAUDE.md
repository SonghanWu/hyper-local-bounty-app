# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a hyper-local bounty app platform where users can post location-based tasks with rewards (e.g., "borrow a charger at the library"). Nearby users can accept and complete these tasks to earn bounties. Target platforms: iOS and Android.

## Tech Stack

- **Frontend:** React Native with Expo CLI
- **Backend:** Node.js (NestJS or Express) with TypeScript
- **Database:** PostgreSQL with PostGIS extension for geospatial queries
- **Caching/Geo:** Redis for real-time geospatial queries (GEOADD, GEORADIUS)
- **Real-time Communication:** Socket.io for live updates and location tracking
- **Infrastructure:** Docker Compose for local development

## Architecture Overview

The system is designed around three core pillars:

1. **Real-time Location Service (LBS)**: Users continuously report their location via WebSocket, stored in Redis for fast geospatial queries. This enables "nearby users" and "nearby bounties" features.

2. **Order Lifecycle Management**: Bounties go through states: `PENDING` → `ACCEPTED` → `COMPLETED` / `CANCELLED`. Critical concurrency handling is needed to prevent multiple users from accepting the same order (use database transactions with `SELECT FOR UPDATE` or optimistic locking).

3. **Virtual Wallet System**: Users have a balance that updates atomically during order completion. Payment flow: Requester's balance is held when order is accepted, then transferred to Helper (minus platform fee) upon completion.

## Development Phases

The project follows a phased approach defined in `development_plan.md`:

- **Phase 1:** Infrastructure setup, user authentication (JWT), basic frontend navigation
- **Phase 2:** Location services (WebSocket location updates, Redis geo-queries, map integration)
- **Phase 3:** Order CRUD, nearby order discovery, accept/complete workflow
- **Phase 4:** Mock payment system with virtual currency
- **Phase 5:** Real-time 1-on-1 chat per order
- **Phase 6:** Docker deployment, Nginx reverse proxy, PM2 process management

## Key Technical Considerations

### Geospatial Queries
- Use Redis `GEOADD` to store user locations: `GEOADD users:locations <lng> <lat> <user_id>`
- Query nearby entities with `GEORADIUS` or `GEOSEARCH` commands
- PostgreSQL with PostGIS handles persistent order locations: use `ST_Distance` to find orders within radius

### Concurrency & Race Conditions
- When implementing "Accept Order" API, use database transactions to prevent double-acceptance
- Example pattern: `BEGIN; SELECT ... FOR UPDATE; UPDATE status WHERE status = 'PENDING'; COMMIT;`
- Ensure atomic balance transfers in wallet system

### Real-time Updates
- WebSocket connections via Socket.io for:
  - Continuous location reporting from mobile clients
  - Order status change notifications
  - Real-time chat messages scoped to order rooms

### Mobile Permissions
- Request location permissions (foreground required, background optional for better UX)
- Use `expo-location` or `react-native-geolocation-service`
- Implement background location updates carefully to balance battery usage

## Project Structure (To Be Created)

```
/backend
  /src
    /auth          # JWT authentication module
    /orders        # Order CRUD & lifecycle management
    /location      # WebSocket gateway for location updates
    /wallet        # Virtual currency & transactions
    /chat          # Socket.io chat rooms
  /docker
    docker-compose.yml  # PostgreSQL + Redis setup

/mobile
  /src
    /screens       # Login, Home, OrderDetail, Wallet, Chat
    /navigation    # React Navigation setup
    /api           # Axios client for backend communication
    /services      # Location tracking, WebSocket client
```

## Development Workflow

1. **Start Backend Services:**
   ```bash
   cd backend
   docker-compose up -d  # Start PostgreSQL and Redis
   npm run start:dev     # Start NestJS in watch mode
   ```

2. **Start Frontend:**
   ```bash
   cd mobile
   expo start
   # Press 'i' for iOS simulator or 'a' for Android emulator
   ```

3. **Database Migrations:**
   ```bash
   npm run migration:run    # Apply pending migrations
   npm run migration:create # Create new migration
   ```

4. **Testing:**
   ```bash
   npm test                 # Run unit tests
   npm run test:e2e         # Run end-to-end tests
   ```

## Implementation Notes

- **Incremental Development:** Work through phases sequentially. Complete verification steps before moving to next phase.
- **Mock Payment First:** Implement virtual wallet system before integrating real payment gateways (Stripe/Alipay). This unblocks development.
- **Test Concurrency Early:** Write tests for concurrent order acceptance scenarios during Phase 3.
- **Location Accuracy:** Consider implementing location accuracy thresholds to filter out stale or inaccurate GPS data.

## Critical Security Considerations

- Store JWT tokens securely on mobile using `expo-secure-store`
- Never expose database credentials; use environment variables
- Validate and sanitize all location data inputs to prevent injection attacks
- Implement rate limiting on location update endpoints to prevent abuse
- Use HTTPS/WSS in production for all API and WebSocket communication
