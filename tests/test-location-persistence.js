const io = require('socket.io-client');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const TEST_USER = {
  email: 'stadium@test.com',
  password: 'TestPass123',
  name: 'User at Stadium'
};

const LOCATION = { latitude: 42.2657, longitude: -83.7487 };

async function testLocationPersistence() {
  console.log('🧪 Test: Location persistence (Redis + PostgreSQL)\n');

  // Step 1: Login
  console.log('1️⃣ Logging in...');
  const loginResponse = await fetch('http://localhost:3000/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: TEST_USER.email,
      password: TEST_USER.password
    })
  });

  if (!loginResponse.ok) {
    console.error('❌ Login failed');
    process.exit(1);
  }

  const { token, user } = await loginResponse.json();
  console.log(`✅ Logged in as: ${user.name}`);
  console.log(`   User ID: ${user.id}\n`);

  // Step 2: Connect and update location
  console.log('2️⃣ Connecting WebSocket...');
  const socket = io('http://localhost:3000', {
    auth: { token },
    transports: ['websocket']
  });

  await new Promise((resolve, reject) => {
    socket.on('connect', () => {
      console.log('✅ WebSocket connected\n');

      console.log('3️⃣ Updating location...');
      socket.emit('update_location', LOCATION, async (response) => {
        if (response.success) {
          console.log('✅ Location updated\n');

          // Wait a bit for database write
          await new Promise(r => setTimeout(r, 500));

          // Step 3: Check Redis has location
          console.log('4️⃣ Checking Redis location...');
          const { stdout: redisCheck } = await execPromise(
            `docker exec bounty-redis redis-cli GEOPOS users:locations ${user.id}`
          );
          console.log(`   Redis output: ${redisCheck.trim()}`);

          if (redisCheck.trim().includes('(nil)')) {
            console.error('❌ FAIL: Location not found in Redis');
            socket.disconnect();
            process.exit(1);
          }
          console.log('✅ PASS: Location exists in Redis\n');

          // Step 4: Check PostgreSQL has location
          console.log('5️⃣ Checking PostgreSQL location...');
          const { stdout: dbCheck } = await execPromise(
            `docker exec bounty-postgres psql -U bounty_user -d bounty_db -t -c "SELECT \\"lastLatitude\\", \\"lastLongitude\\", \\"lastLocationUpdatedAt\\" FROM users WHERE id='${user.id}';"`
          );
          console.log(`   Database record: ${dbCheck.trim()}`);

          const dbParts = dbCheck.trim().split('|').map(s => s.trim());
          const dbLat = parseFloat(dbParts[0]);
          const dbLng = parseFloat(dbParts[1]);

          if (!dbLat || !dbLng) {
            console.error('❌ FAIL: Location not found in PostgreSQL');
            socket.disconnect();
            process.exit(1);
          }

          // Verify coordinates match
          if (Math.abs(dbLat - LOCATION.latitude) > 0.0001 ||
              Math.abs(dbLng - LOCATION.longitude) > 0.0001) {
            console.error(`❌ FAIL: Coordinates mismatch. Expected (${LOCATION.latitude}, ${LOCATION.longitude}), got (${dbLat}, ${dbLng})`);
            socket.disconnect();
            process.exit(1);
          }
          console.log('✅ PASS: Location persisted to PostgreSQL\n');

          // Step 5: Disconnect and check Redis removes, PostgreSQL keeps
          console.log('6️⃣ Disconnecting WebSocket...');
          socket.disconnect();

          await new Promise(r => setTimeout(r, 2000));

          console.log('7️⃣ Checking Redis after disconnect...');
          const { stdout: redisAfter } = await execPromise(
            `docker exec bounty-redis redis-cli ZRANK users:locations ${user.id}`
          );

          if (!redisAfter.includes('(nil)') && redisAfter.trim() !== '') {
            console.error('❌ FAIL: Location should be removed from Redis after disconnect');
            console.error(`   Redis response: "${redisAfter.trim()}"`);
            process.exit(1);
          }
          console.log('✅ PASS: Location removed from Redis\n');

          console.log('8️⃣ Checking PostgreSQL after disconnect...');
          const { stdout: dbAfter } = await execPromise(
            `docker exec bounty-postgres psql -U bounty_user -d bounty_db -t -c "SELECT \\"lastLatitude\\", \\"lastLongitude\\" FROM users WHERE id='${user.id}';"`
          );

          const dbAfterParts = dbAfter.trim().split('|').map(s => s.trim());
          const dbLatAfter = parseFloat(dbAfterParts[0]);
          const dbLngAfter = parseFloat(dbAfterParts[1]);

          if (!dbLatAfter || !dbLngAfter) {
            console.error('❌ FAIL: Location removed from PostgreSQL (should persist)');
            process.exit(1);
          }
          console.log('✅ PASS: Location persisted in PostgreSQL\n');

          console.log('=' .repeat(50));
          console.log('✅ TEST PASSED: Location persistence working correctly');
          console.log('   - Location written to both Redis and PostgreSQL');
          console.log('   - Redis: Fast, temporary (deleted on disconnect)');
          console.log('   - PostgreSQL: Persistent (kept for push notifications)');
          console.log('=' .repeat(50));

          resolve();
        } else {
          console.error('❌ Location update failed');
          socket.disconnect();
          reject();
        }
      });
    });

    socket.on('connect_error', (error) => {
      console.error('❌ WebSocket connection error:', error.message);
      reject();
    });
  });

  process.exit(0);
}

testLocationPersistence().catch(error => {
  console.error('❌ Test error:', error);
  process.exit(1);
});
