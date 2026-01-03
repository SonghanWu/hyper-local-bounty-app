# Automated Tests

## Overview

Comprehensive automated tests for all phases of the hyper-local bounty app.

## Prerequisites

- Backend server running on `http://localhost:3000`
- PostgreSQL container (`bounty-postgres`) running
- Redis container (`bounty-redis`) running

**No manual user setup required** - all tests create unique test users automatically.

## Running Tests

### Run All Tests
```bash
# From project root
bash tests/run-all-tests.sh
```

This runs 6 test suites covering Phases 2, 3, and 4.

### Run Individual Tests

You can run any test individually:

```bash
node tests/test-logout-push-notifications.js
node tests/test-ttl-mechanism.js
node tests/test-location-persistence.js
node tests/test-phase3-orders.js
node tests/test-wallet-system.js
node tests/test-user-profile.js
```

## Test Suites

### Phase 2: Location Tracking

#### Test 1: Logout Push Notification Control
**File:** `test-logout-push-notifications.js`

**What it tests:**
- `pushNotificationsEnabled` is `true` after login
- Logout event sets `pushNotificationsEnabled` to `false`
- User won't receive push notifications after logout

**Why it matters:** Privacy + UX - logged out users shouldn't receive push notifications.

#### Test 2: TTL Mechanism
**File:** `test-ttl-mechanism.js`

**What it tests:**
- TTL marker set to 300 seconds on location update
- TTL refreshes to 300 seconds on each update
- TTL marker removed on disconnect
- Protection for abnormal disconnects (crashes, battery dies)

**Why it matters:** Prevents stale location data when users abnormally disconnect.

**Real-world behavior:**
- Normal disconnect: Immediate cleanup (tested)
- Abnormal disconnect: Auto-cleanup after 5 minutes (TTL expires)

#### Test 3: Location Persistence
**File:** `test-location-persistence.js`

**What it tests:**
- Location written to both Redis and PostgreSQL
- Redis location removed on disconnect
- PostgreSQL location persists after disconnect
- Supports push notifications based on last known location

**Why it matters:** Dual storage enables both real-time queries (Redis) and push notifications (PostgreSQL).

**Use cases:**
- Redis: "Show nearby online users" (real-time)
- PostgreSQL: "Send push for nearby orders" (persistent)

---

### Phase 3: Order Lifecycle

#### Test 4: Order CRUD and Lifecycle
**File:** `test-phase3-orders.js`

**What it tests:**
1. **Create Order**: Requester posts an order with location and reward
2. **Nearby Order Discovery**: Helper finds orders within radius
3. **Accept Order**: Helper accepts pending order (concurrency-safe)
4. **Race Condition Prevention**: Second helper cannot accept same order
5. **Complete Order**: Requester marks order as completed
6. **Order History**: Users can view their order history

**Why it matters:** Core business logic - order lifecycle must be robust with proper concurrency control.

**Key features tested:**
- Order status transitions (PENDING → ACCEPTED → COMPLETED)
- Geographic queries (ST_Distance with PostGIS)
- Pessimistic locking to prevent double-acceptance
- Authorization (only requester can complete, only non-requesters can accept)

---

### Phase 4: Virtual Wallet System

#### Test 5: Virtual Wallet System
**File:** `test-wallet-system.js`

**What it tests:**
1. **Initial Balance**: New users start with $100
2. **Manual Transfer**: Transfer $10 from Alice to Bob
   - Alice: $100 → $90 (sent $10)
   - Bob: $100 → $109 (received $9 after 10% platform fee)
3. **Transaction History**: Both users have transaction records
4. **Order Completion Payment**: Payment automatically triggered on order completion
   - Alice posts $5 order → Bob accepts → Alice completes
   - Alice: $90 → $85 (paid $5)
   - Bob: $109 → $113.5 (received $4.5 after fee)
5. **Insufficient Balance Check**: Cannot post order if balance < reward amount
6. **Platform Fee Tracking**: Platform fee transactions recorded (filtered in frontend)

**Why it matters:** Financial transactions must be atomic, accurate, and prevent race conditions.

**Key features tested:**
- Pessimistic locking (`SELECT FOR UPDATE`) for atomic transfers
- Platform fee calculation (10% deducted)
- Transaction types (TRANSFER, PLATFORM_FEE)
- Balance validation before order posting
- Decimal precision handling

#### Test 6: User Profile Update
**File:** `test-user-profile.js`

**What it tests:**
1. **Get Profile**: Retrieve current user profile
2. **Update Name**: Change username successfully
3. **Update Password**: Change password with correct current password
4. **Wrong Password Rejection**: Update fails with incorrect current password
5. **Timestamp Tracking**: `updated_at` changes after update

**Why it matters:** User data management with proper authentication and timestamp tracking.

**Key features tested:**
- Password verification (bcrypt)
- `updated_at` automatic timestamp update
- Email read-only protection (frontend enforced)

---

## Test Results

All tests output clear pass/fail status:

```
✅ TEST PASSED
```

```
❌ FAIL: [Failure reason]
```

## Troubleshooting

### "Request failed with status code 409"
This usually means duplicate email or phone.
- **Solution**: Tests now generate unique emails and phones using timestamps
- If still failing, check backend logs for the actual conflict field

### "WebSocket connection error"
- Verify backend server is running: `curl http://localhost:3000/health`
- Check WebSocket gateway is loaded in backend

### "docker exec" error
Verify Docker containers are running:
```bash
docker ps | grep bounty
```
Should see `bounty-postgres` and `bounty-redis`.

### "Insufficient balance" in wallet tests
This is expected in Test 5 step 5 - it tests that orders are rejected when balance is too low.

### Tests pass but data persists
Tests create new users with unique timestamps, so repeated runs won't conflict. Old test data in database is harmless.

## Adding New Tests

To add a new test:

1. **Create test file** in `tests/` directory:
```javascript
const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('🧪 Starting [Feature] Tests...\n');

  try {
    // Test implementation

    console.log('🎉 All [Feature] Tests Completed!\n');
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    throw error;
  }
}

runTests()
  .then(() => {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Tests failed:', error.message);
    process.exit(1);
  });
```

2. **Add to `run-all-tests.sh`**:
```bash
sleep 2

echo -e "${YELLOW}Test N: [Description]${NC}"
node tests/test-[feature-name].js
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Test N PASSED${NC}\n"
else
  echo -e "${RED}❌ Test N FAILED${NC}\n"
  FAILED=$((FAILED + 1))
fi
```

## Notes

- Tests use **real database and Redis** (not mocked)
- Tests **auto-generate unique users** with timestamps
- **Safe to run multiple times** without cleanup
- **Run before committing** to ensure no regressions
- Tests are **independent** - can run individually or all together
