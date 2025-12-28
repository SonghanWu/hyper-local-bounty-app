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

**Phase 1 ✅ Complete:** Infrastructure & Authentication
- User registration/login with JWT
- PostgreSQL database setup
- Redis integration

**Phase 2 ✅ Complete:** Real-time Location Tracking
- WebSocket real-time communication
- GPS location tracking (expo-location)
- Redis geospatial queries (GEORADIUS)
- PostgreSQL location persistence
- TTL-based user activity tracking
- Logout vs background distinction

**Phase 3 🚧 In Progress:** Order Management System

---

## Location Architecture (Phase 2)

### Data Storage Strategy

**Redis (Real-time, Volatile):**
- Stores online user locations for instant queries
- Geospatial commands: `GEOADD`, `GEORADIUS`
- TTL mechanism: 5-minute auto-expiration for offline detection
- Use case: "Show nearby online users"

**PostgreSQL (Persistent, Reliable):**
- Stores last known location for all users
- Fields: `lastLatitude`, `lastLongitude`, `lastLocationUpdatedAt`
- Use case: Push notifications for nearby orders

### User States

| State | WebSocket | Redis | PostgreSQL | Push Enabled | Receives Push? |
|-------|-----------|-------|------------|--------------|----------------|
| Online (foreground) | ✅ Connected | ✅ Location | ✅ Location | ✅ true | ✅ Real-time |
| Backgrounded | ❌ Disconnected | ❌ Removed | ✅ Last location | ✅ true | ✅ Via push |
| Logged out | ❌ Disconnected | ❌ Removed | ✅ Last location | ❌ false | ❌ No push |

### TTL Mechanism

**Purpose:** Automatically clean up stale location data

**How it works:**
1. User updates location → Redis sets TTL marker (300 seconds)
2. Each update refreshes TTL to 300 seconds
3. User closes app → Stops updating
4. After 5 minutes → TTL expires, automatic cleanup
5. Query nearby users → Filters expired TTL markers

**Key points:**
- User staying still won't be marked offline (updates every 5 seconds)
- Normal disconnect: Immediate cleanup
- Abnormal disconnect (crash): Auto-cleanup after 5 minutes

### Location Update Flow

```
User opens app
  ↓
WebSocket connects (JWT auth)
  ↓
GPS tracking starts (every 5 seconds)
  ↓
Each location update:
  ├─→ Redis: GEOADD + TTL marker (real-time)
  └─→ PostgreSQL: Update last location (persistence)
  ↓
User closes app
  ↓
WebSocket disconnects
  ↓
Redis: Location removed (immediate)
PostgreSQL: Location kept (for push notifications)
```

### Push Notification Strategy (Phase 3)

```typescript
// Find users for push notifications
const nearbyUsers = await userRepository
  .createQueryBuilder('user')
  .where('pushNotificationsEnabled = true')  // Skip logged out users
  .andWhere(
    'ST_DWithin(location, :orderLocation, :radius)',  // Within 2km
    { orderLocation, radius: 2000 }
  )
  .andWhere(
    'lastLocationUpdatedAt > :cutoff',  // Active within 30 minutes
    { cutoff: new Date(Date.now() - 30 * 60 * 1000) }
  )
  .getMany();

await sendPushNotifications(nearbyUsers, orderDetails);
```

---

## Testing

### Run All Tests
```bash
cd /path/to/project
bash tests/run-all-tests.sh
```

### Individual Tests
```bash
# Test 1: Logout disables push notifications
node tests/test-logout-push-notifications.js

# Test 2: TTL mechanism
node tests/test-ttl-mechanism.js

# Test 3: Location persistence (Redis + PostgreSQL)
node tests/test-location-persistence.js
```

---

## Documentation

- **[Development Plan](development_plan.md)** - Phased implementation roadmap
- **[TODO](TODO.md)** - Future enhancements (map integration, background location, database optimization)

---

## License

MIT
