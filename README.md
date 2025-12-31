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

### Mobile App Setup

```bash
cd mobile

# Install dependencies
npm install

# Start Expo development server
npx expo start
```

#### Important: IP Address Configuration

**Problem**: When testing on a physical device (not simulator), the mobile app needs your computer's local IP address to connect to the backend. This IP can change when you reconnect to WiFi or restart your computer.

**Quick Fix**: Run this command whenever your IP changes:

```bash
./update-ip.sh
```

This script will:
1. Detect your current WiFi IP address
2. Automatically update `mobile/config/api.config.ts`
3. Show you when to reload your Expo app

**Manual Alternative**:
1. Find your IP: `ipconfig getifaddr en0`
2. Update `mobile/config/api.config.ts` with the new IP
3. Reload the Expo app (press 'r' in terminal or shake device)

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

**Phase 3.1 ✅ Complete:** Order Management (CRUD)
- Order entity with status lifecycle (PENDING, ACCEPTED, COMPLETED, CANCELLED)
- Create Order API
- List Nearby Orders API with customizable radius (100m - 50km, default 1km)
- PostGIS distance calculation (ST_Distance + ST_DWithin)
- Get Order by ID and My Orders APIs

**Phase 3.2 ✅ Complete:** Accept Order & Concurrency Handling
- Accept Order API with database transaction
- SELECT FOR UPDATE (pessimistic locking) to prevent race conditions
- Order status validation (only PENDING can be accepted)
- WebSocket real-time notification to requester when order accepted
- Concurrent request handling verified (only one helper succeeds)

**Phase 3.3 ✅ Complete:** Complete Order & Cancel Order
- Complete Order API (only requester can complete ACCEPTED orders)
- Cancel Order API (requester or helper can cancel, except COMPLETED)
- WebSocket notifications on status change (complete/cancel)
- Frontend: Nearby Orders section with customizable radius (500m-10km)
- Display order list with title, description, reward, distance, status

**Phase 3.4 ✅ Complete:** Order Detail Screen & Accept Flow
- OrderDetailScreen component with full order information
- Role-based action buttons (Accept/Complete/Cancel)
- Real-time WebSocket updates for order status changes
- Navigation from order list to detail screen
- Complete order lifecycle UI flow

**Phase 3.5 ✅ Complete:** Geofencing & Distance Monitoring
- Automatic distance monitoring for both Requester and Helper
  - Requester: Monitored when order is PENDING or ACCEPTED (stay near your order!)
  - Helper: Monitored when order is ACCEPTED (stay near the task location!)
- Local push notifications when user moves >500m away from order location
- In-app alert with option to cancel order
- Cooldown mechanism (1 alert per minute) to prevent notification spam
- Haversine formula distance calculation
- Auto-cleanup when order is completed or cancelled

**Phase 4 🚧 Next:** Mock Payment System (Virtual Wallet)

---

## Location Architecture (Phase 2)

### Data Storage Strategy

**Redis (Real-time, Volatile):**
- Stores online user locations for instant queries
- Geospatial commands: `GEOADD`, `GEORADIUS`
- TTL mechanism: 5-minute auto-expiration for offline detection
- Primary use: Determine user online status (for chat, live updates, presence indicators)

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

**Purpose:** Automatically clean up stale location data and determine online status

**How it works:**
1. User updates location → Redis sets TTL marker (300 seconds)
2. Each update refreshes TTL to 300 seconds
3. User closes app → Stops updating
4. After 5 minutes → TTL expires, user removed from Redis
5. Redis queries only return online users; PostgreSQL still has last location for offline users

**Key points:**
- User staying still won't be marked offline (updates every 5 seconds)
- Normal disconnect: Immediate cleanup
- Abnormal disconnect (crash): Auto-cleanup after 5 minutes

**Query Scenarios:**
- **Online users (chat, live updates):** Query Redis → Only returns users with active TTL
- **Push notifications:** Query PostgreSQL → Returns all nearby users including offline

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
