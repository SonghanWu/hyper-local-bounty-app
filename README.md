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
├── mobile/           # React Native app
├── tests/            # Automated test suites
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

# Run database migrations
npm run migration:run

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

**Problem**: When testing on a physical device (not simulator), the mobile app needs your computer's local IP address to connect to the backend.

**Quick Fix**: Run this command whenever your IP changes:

```bash
./update-ip.sh
```

This script will automatically detect your WiFi IP and update `mobile/config/api.config.ts`.

---

## Development Status

### Phase 1 ✅ Complete: Infrastructure & Authentication
- User registration/login with JWT authentication
- PostgreSQL database setup with TypeORM
- Redis integration for caching and geospatial queries
- Docker Compose for local development
- Basic mobile app navigation

### Phase 2 ✅ Complete: Real-time Location Tracking
- WebSocket real-time communication (Socket.io)
- GPS location tracking (expo-location, every 5 seconds)
- Redis geospatial queries (GEOADD, GEORADIUS)
- PostgreSQL location persistence (lastLatitude, lastLongitude, lastLocationUpdatedAt)
- TTL-based user activity tracking (5-minute auto-expiration)
- Logout vs background app distinction
- Push notification control (disabled on logout)
- Dual storage strategy (Redis for real-time, PostgreSQL for push notifications)

### Phase 3 ✅ Complete: Order Lifecycle Management

**Phase 3.1**: Order CRUD
- Order entity with status lifecycle (PENDING → ACCEPTED → COMPLETED/CANCELLED)
- Create, Read, Update, Delete order APIs
- PostGIS geographic queries (ST_Distance, ST_DWithin)
- List nearby orders with customizable radius (100m - 50km)

**Phase 3.2**: Concurrency Control
- Accept Order API with pessimistic locking (SELECT FOR UPDATE)
- Race condition prevention (only one helper can accept)
- Database transactions for atomic updates
- Real-time WebSocket notifications on order acceptance

**Phase 3.3**: Order Completion & Cancellation
- Complete Order API (only requester can complete)
- Cancel Order API (requester or helper can cancel)
- Status validation and authorization checks
- WebSocket notifications on status changes

**Phase 3.4**: Frontend Order UI
- OrderDetailScreen with full order information
- Role-based action buttons (Accept/Complete/Cancel)
- Real-time order status updates via WebSocket
- Order list with distance calculation
- Navigation between order list and detail screen

**Phase 3.5**: Geofencing & Distance Monitoring
- Automatic distance monitoring for Requester and Helper
  - Requester: Monitored when order is PENDING or ACCEPTED
  - Helper: Monitored when order is ACCEPTED
- Local push notifications when user moves >500m from order location
- In-app alert with option to cancel order
- Cooldown mechanism (1 alert per 5 minutes)
- Haversine formula distance calculation
- Auto-cleanup on order completion/cancellation

### Phase 4 ✅ Complete: Virtual Wallet System

**Phase 4.1 ✅**: Virtual Currency & Payments (Backend)
- User balance ($100 initial balance for all new users)
- Transaction entity (TRANSFER, PLATFORM_FEE, REFUND types)
- Atomic money transfers with pessimistic locking (SELECT FOR UPDATE)
- Platform fee system (10% automatically deducted)
- Payment integration in order completion flow
  - Requester balance checked before posting order
  - Payment automatically transferred on order completion
  - Platform fee deducted from transfer amount
- Wallet API endpoints
  - `GET /wallet/balance` - Get current balance
  - `GET /wallet/transactions` - Get transaction history
  - `POST /wallet/transfer` - Transfer money (for testing)

**Phase 4.2 ✅**: Wallet UI & User Profile (Frontend)
- Mobile WalletScreen
  - Balance display with visual card
  - Transaction history with icons and colors
  - Click transaction to view related order
  - Amount display: green for income (+), red for expense (-)
  - Transaction description includes platform fee details
- User profile management
  - `GET /users/me` - Get user profile
  - `PATCH /users/me` - Update name and password
  - ProfileScreen in mobile app
  - Password change with current password verification
  - `updated_at` timestamp tracking

**Phase 4.3 ✅**: Push Notifications System
- Expo Push Notifications integration (iOS supported, Android requires Development Build)
- User-configurable notification radius (500m, 1km, 2km, 5km)
- Automatic push notifications for nearby orders
  - Backend NotificationsService finds users within their custom radius
  - Respects each user's notification preferences
  - Filters by online/recent users (last 30 minutes)
- Push token management
  - `POST /users/push-token` - Register Expo push token
  - Auto-enable `pushNotificationsEnabled` when token is saved
  - Token validation using Expo SDK
- Frontend notification handling
  - notification.service.ts handles token registration
  - App.tsx global listeners for notification events
  - Deep linking: tapping notification opens order detail
  - Notification permissions requested after login

### Phase 5 🚧 Next: Real-time Chat (1-on-1 per Order)

---

## Architecture Deep Dive

### Phase 2: Location Tracking Architecture

#### Data Storage Strategy

**Redis (Real-time, Volatile):**
- Stores online user locations for instant queries
- Geospatial commands: `GEOADD users:locations <lng> <lat> <user_id>`
- Query with: `GEORADIUS users:locations <lng> <lat> <radius> m`
- TTL mechanism: 5-minute auto-expiration for offline detection
- Primary use: Determine user online status (for chat, live updates, presence)

**PostgreSQL (Persistent, Reliable):**
- Stores last known location for all users
- Fields: `lastLatitude`, `lastLongitude`, `lastLocationUpdatedAt`
- Use case: Push notifications for nearby orders (even when user is offline)

#### User States

| State | WebSocket | Redis | PostgreSQL | Push Enabled | Receives Push? |
|-------|-----------|-------|------------|--------------|----------------|
| Online (foreground) | ✅ Connected | ✅ Location | ✅ Location | ✅ true | ✅ Real-time |
| Backgrounded | ❌ Disconnected | ❌ Removed | ✅ Last location | ✅ true | ✅ Via push |
| Logged out | ❌ Disconnected | ❌ Removed | ✅ Last location | ❌ false | ❌ No push |

#### TTL Mechanism

**Purpose:** Automatically clean up stale location data and determine online status

**How it works:**
1. User updates location → Redis sets TTL marker (300 seconds)
2. Each update refreshes TTL to 300 seconds
3. User closes app → Stops updating
4. After 5 minutes → TTL expires, user removed from Redis
5. Redis queries only return online users; PostgreSQL still has last location

**Key points:**
- User staying still won't be marked offline (updates every 5 seconds)
- Normal disconnect: Immediate cleanup via WebSocket disconnect handler
- Abnormal disconnect (crash/battery dies): Auto-cleanup after 5 minutes via TTL

**Query Scenarios:**
- **Online users (chat, live updates):** Query Redis → Only returns users with active TTL
- **Push notifications:** Query PostgreSQL → Returns all nearby users including offline

#### Location Update Flow

```
User opens app
  ↓
WebSocket connects (JWT auth)
  ↓
GPS tracking starts (every 5 seconds)
  ↓
Each location update:
  ├─→ Redis: GEOADD + TTL marker (real-time queries)
  └─→ PostgreSQL: Update last location (push notifications)
  ↓
User closes app / disconnects
  ↓
WebSocket disconnect event
  ↓
Redis: Location removed immediately
PostgreSQL: Location kept for push notifications
```

#### WebSocket Heartbeat

- **Ping interval**: 25 seconds
- **Ping timeout**: 60 seconds
- Prevents connection timeouts due to network gateway idle timeouts
- Client must respond to ping within 60 seconds or connection is closed

---

### Phase 3: Order Management Architecture

#### Order Status Lifecycle

```
PENDING → ACCEPTED → COMPLETED
   ↓
CANCELLED (from any state except COMPLETED)
```

#### Geographic Queries with PostGIS

**Finding Nearby Orders:**
```sql
SELECT *,
  ST_Distance(
    ST_MakePoint(order.longitude, order.latitude)::geography,
    ST_MakePoint(:userLng, :userLat)::geography
  ) as distance
FROM orders
WHERE status = 'PENDING'
  AND ST_DWithin(
    ST_MakePoint(order.longitude, order.latitude)::geography,
    ST_MakePoint(:userLng, :userLat)::geography,
    :radius
  )
ORDER BY distance ASC;
```

**Key points:**
- `ST_Distance` calculates actual distance in meters (using geography type)
- `ST_DWithin` efficiently filters orders within radius (uses spatial index)
- Results sorted by distance (closest first)

#### Concurrency Control (Race Condition Prevention)

**Problem:** Two helpers trying to accept same order simultaneously

**Solution:** Pessimistic locking with database transaction

```typescript
const queryRunner = this.dataSource.createQueryRunner();
await queryRunner.connect();
await queryRunner.startTransaction();

try {
  // Lock the order row - other transactions will wait
  const order = await queryRunner.manager.findOne(Order, {
    where: { id: orderId },
    lock: { mode: 'pessimistic_write' },
  });

  // Check status - only first helper sees PENDING
  if (order.status !== OrderStatus.PENDING) {
    throw new BadRequestException('Order already accepted');
  }

  // Update status
  order.status = OrderStatus.ACCEPTED;
  order.helperId = helperId;
  await queryRunner.manager.save(order);

  await queryRunner.commitTransaction();
} catch (error) {
  await queryRunner.rollbackTransaction();
  throw error;
} finally {
  await queryRunner.release();
}
```

**Result:**
- First helper: Gets lock → Sees PENDING → Updates to ACCEPTED → Success
- Second helper: Waits for lock → Sees ACCEPTED → Throws error → Rollback

#### Geofencing Implementation

**Purpose:** Alert users when they move too far from order location

**Monitored users:**
- **Requester**: When order is PENDING or ACCEPTED (stay near your order!)
- **Helper**: When order is ACCEPTED (stay near task location!)

**Flow:**
1. Order status changes → Start monitoring
2. GPS location update (every 5 seconds) → Calculate distance
3. Distance > 500m → Local push notification
4. User clicks notification → In-app alert with cancel option
5. Cooldown: Max 1 alert per 5 minutes
6. Order completed/cancelled → Stop monitoring

**Haversine formula** used for distance calculation (pure JavaScript, no external dependencies).

---

### Phase 4: Virtual Wallet Architecture

#### Transaction Types

```typescript
enum TransactionType {
  TRANSFER       // User-to-user transfer
  PLATFORM_FEE   // Platform commission (10% of transfer)
  REFUND         // Order cancellation refund (future)
  TOP_UP         // Add money from real payment (Phase 4.2)
  WITHDRAWAL     // Cash out to bank account (Phase 4.2)
}

enum TransactionStatus {
  PENDING    // Transaction initiated
  COMPLETED  // Transaction successful
  FAILED     // Transaction failed (insufficient balance, etc.)
  CANCELLED  // Transaction cancelled
}
```

#### Payment Flow on Order Completion

```typescript
// 1. Order completed by requester
async completeOrder(orderId, userId) {
  const order = await getOrder(orderId);

  // 2. Transfer money atomically
  await walletService.transfer(
    order.requesterId,   // From: Requester
    order.helperId,      // To: Helper
    order.rewardAmount,  // Amount: $10
    orderId,             // Link to order
    10                   // Platform fee: 10%
  );

  // Result:
  // - Requester balance: -$10
  // - Helper balance: +$9 (after 10% fee)
  // - Platform fee: +$1 (separate transaction)
}
```

#### Atomic Transfer with Pessimistic Locking

**Problem:** Concurrent transfers might cause incorrect balance updates

**Solution:** Database transaction with row locking

```typescript
async transfer(fromUserId, toUserId, amount, platformFeePercentage = 10) {
  const platformFee = amount * 0.1;
  const netAmount = amount - platformFee;

  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.startTransaction();

  try {
    // Lock sender row (other transactions wait)
    const sender = await queryRunner.manager.findOne(User, {
      where: { id: fromUserId },
      lock: { mode: 'pessimistic_write' },
    });

    // Check sufficient balance
    if (sender.balance < amount) {
      throw new BadRequestException('Insufficient balance');
    }

    // Lock receiver row
    const receiver = await queryRunner.manager.findOne(User, {
      where: { id: toUserId },
      lock: { mode: 'pessimistic_write' },
    });

    // Update balances
    sender.balance -= amount;
    receiver.balance += netAmount;

    await queryRunner.manager.save(User, sender);
    await queryRunner.manager.save(User, receiver);

    // Create transaction records
    await createTransactionRecords(sender, receiver, amount, netAmount, platformFee);

    await queryRunner.commitTransaction();
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}
```

#### Transaction Record Schema

```sql
CREATE TABLE transactions (
  id UUID PRIMARY KEY,
  from_user_id UUID REFERENCES users(id),  -- NULL for TOP_UP
  to_user_id UUID REFERENCES users(id),    -- NULL for WITHDRAWAL
  amount DECIMAL(10,2),                    -- Net amount (after fee)
  type VARCHAR,                            -- TRANSFER, PLATFORM_FEE, etc.
  status VARCHAR,                          -- PENDING, COMPLETED, FAILED
  order_id UUID REFERENCES orders(id),     -- Link to order
  description TEXT,                        -- "Transfer: $10 (Platform fee: $1, Net: $9)"
  failure_reason TEXT,                     -- Error message if failed
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

**Display logic:**
- **Sender view**: Shows total amount (-$10) and description with fee breakdown
- **Receiver view**: Shows net amount (+$9) and description with fee info
- **Platform fee**: Separate PLATFORM_FEE transaction (filtered in frontend)

#### Balance Validation

**Before posting order:**
```typescript
if (userBalance < rewardAmount) {
  throw new BadRequestException('Insufficient balance');
}
```

**Error handling:**
- Backend: Returns 400 with detailed message
- Frontend: Shows "Insufficient Balance" alert (not generic "Error")

---

## Testing

### Run All Tests
```bash
cd /path/to/project
bash tests/run-all-tests.sh
```

This runs 6 test suites covering Phases 2, 3, and 4.

### Test Coverage

**Phase 2 Tests:**
1. Logout disables push notifications
2. TTL mechanism (5-minute auto-expiration)
3. Location persistence (Redis + PostgreSQL dual storage)

**Phase 3 Tests:**
4. Order lifecycle (CRUD, nearby discovery, race conditions, authorization)

**Phase 4 Tests:**
5. Virtual wallet (Balance $100, transfers with 10% fee, order payments)
6. User profile (Name/password updates with verification)

See [tests/README.md](tests/README.md) for detailed test documentation.

---

## Documentation

- **[Development Plan](development_plan.md)** - Phased implementation roadmap
- **[Test Documentation](tests/README.md)** - Test suites and troubleshooting
- **[TODO](TODO.md)** - Future enhancements (Stripe, content moderation, background location)

---

## License

MIT
