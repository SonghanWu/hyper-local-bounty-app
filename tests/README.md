# Phase 2 Tests

## Overview

Automated tests for Phase 2 location tracking functionality.

## Prerequisites

- Backend server running on `http://localhost:3000`
- PostgreSQL container (`bounty-postgres`) running
- Redis container (`bounty-redis`) running
- Test users registered in database:
  - `central@test.com` / `TestPass123`
  - `north@test.com` / `TestPass123`
  - `stadium@test.com` / `TestPass123`

## Running Tests

### Run All Tests
```bash
# From project root
bash tests/run-all-tests.sh
```

### Run Individual Tests

**Test 1: Logout disables push notifications**
```bash
node tests/test-logout-push-notifications.js
```
Verifies that:
- `pushNotificationsEnabled` is `true` before logout
- Logout event sets `pushNotificationsEnabled` to `false`
- User won't receive push notifications after logout

**Test 2: TTL mechanism**
```bash
node tests/test-ttl-mechanism.js
```
Verifies that:
- TTL marker set to 300 seconds on location update
- TTL refreshes to 300 seconds on each update
- TTL marker removed on disconnect
- Provides protection for abnormal disconnects (crashes)

**Test 3: Location persistence**
```bash
node tests/test-location-persistence.js
```
Verifies that:
- Location written to both Redis and PostgreSQL
- Redis location removed on disconnect
- PostgreSQL location persists after disconnect
- Supports push notifications based on last known location

## Test Results

All tests should output:
```
==================================================
✅ TEST PASSED: [Test description]
==================================================
```

If a test fails, it will output:
```
❌ FAIL: [Failure reason]
```

## What's Being Tested

### 1. Logout Push Notification Control
**Why it matters:** Users who logout shouldn't receive push notifications (privacy + UX).

**Test flow:**
1. Login → WebSocket connect → Update location
2. Check database: `pushNotificationsEnabled = true`
3. Send logout event via WebSocket
4. Check database: `pushNotificationsEnabled = false`
5. Restore state for next test

### 2. TTL Mechanism
**Why it matters:** Prevents stale location data when users abnormally disconnect (crash, battery dies).

**Test flow:**
1. Login → Connect → Update location
2. Verify TTL = 300 seconds
3. Wait 5 seconds → Update again
4. Verify TTL refreshed to 300 seconds
5. Disconnect → Verify TTL removed

**Real-world behavior:**
- Normal disconnect: Immediate cleanup (tested)
- Abnormal disconnect: Auto-cleanup after 5 minutes (TTL expires)

### 3. Location Persistence
**Why it matters:** Dual storage enables both real-time queries (Redis) and push notifications (PostgreSQL).

**Test flow:**
1. Login → Connect → Update location
2. Verify location in Redis (GEOPOS)
3. Verify location in PostgreSQL (SELECT query)
4. Disconnect
5. Verify Redis location removed
6. Verify PostgreSQL location persists

**Use cases:**
- Redis: "Show nearby online users" (real-time)
- PostgreSQL: "Send push for nearby orders" (persistent)

## Troubleshooting

### Test fails with "Login failed"
- Check test user exists in database
- Verify password is `TestPass123` (8 chars, mixed case, numbers)
- Re-register test users if needed

### Test fails with "WebSocket connection error"
- Verify backend server is running on port 3000
- Check `curl http://localhost:3000/health` returns `{"status":"ok"}`

### Test fails with "docker exec" error
- Verify Docker containers are running:
  ```bash
  docker ps | grep bounty
  ```
- Should see `bounty-postgres` and `bounty-redis`

### TTL test shows unexpected value
- This is normal due to async timing
- TTL should be within 290-300 seconds
- If TTL is -2 or negative, check backend logs

## Adding New Tests

To add a new test:

1. Create `test-[feature-name].js` in this directory
2. Follow existing test structure:
   ```javascript
   const io = require('socket.io-client');
   const { exec } = require('child_process');
   const util = require('util');
   const execPromise = util.promisify(exec);

   async function testFeature() {
     console.log('🧪 Test: [Description]\n');

     // Test implementation

     console.log('=' .repeat(50));
     console.log('✅ TEST PASSED: [Description]');
     console.log('=' .repeat(50));
     process.exit(0);
   }

   testFeature().catch(error => {
     console.error('❌ Test error:', error);
     process.exit(1);
   });
   ```

3. Add to `run-all-tests.sh`:
   ```bash
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

- Tests use real database and Redis (not mocked)
- Tests clean up after themselves (restore state)
- Safe to run multiple times
- Run tests before committing changes to Phase 2
