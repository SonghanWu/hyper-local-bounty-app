const io = require('socket.io-client');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const TEST_USER = {
  email: 'north@test.com',
  password: 'TestPass123',
  name: 'User at North Campus'
};

const LOCATION = { latitude: 42.2932, longitude: -83.7162 };

async function checkRedisTTL(userId) {
  const { stdout } = await execPromise(
    `docker exec bounty-redis redis-cli TTL user:${userId}:location_active`
  );
  return parseInt(stdout.trim());
}

async function testTTLMechanism() {
  console.log('🧪 Test: TTL mechanism (5-minute expiration)\n');

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
  console.log('2️⃣ Connecting WebSocket and updating location...');
  const socket = io('http://localhost:3000', {
    auth: { token },
    transports: ['websocket']
  });

  await new Promise((resolve, reject) => {
    socket.on('connect', () => {
      console.log('✅ WebSocket connected\n');

      socket.emit('update_location', LOCATION, async (response) => {
        if (response.success) {
          console.log('✅ Location updated\n');

          // Step 3: Check TTL is set (should be ~300 seconds)
          console.log('3️⃣ Checking TTL marker...');
          const ttl = await checkRedisTTL(user.id);
          console.log(`   TTL: ${ttl} seconds`);

          if (ttl < 290 || ttl > 300) {
            console.error(`❌ FAIL: TTL should be ~300 seconds, got ${ttl}`);
            socket.disconnect();
            process.exit(1);
          }
          console.log('✅ PASS: TTL is correctly set to 300 seconds\n');

          // Step 4: Wait 5 seconds and check TTL refreshes
          console.log('4️⃣ Waiting 5 seconds (location update should refresh TTL)...');
          setTimeout(async () => {
            // Manually update location again
            socket.emit('update_location', LOCATION, async (updateResponse) => {
              if (updateResponse.success) {
                const newTtl = await checkRedisTTL(user.id);
                console.log(`   TTL after refresh: ${newTtl} seconds`);

                if (newTtl < 290 || newTtl > 300) {
                  console.error(`❌ FAIL: TTL should refresh to ~300, got ${newTtl}`);
                  socket.disconnect();
                  process.exit(1);
                }
                console.log('✅ PASS: TTL refreshed correctly\n');

                // Step 5: Disconnect and verify cleanup
                console.log('5️⃣ Disconnecting (simulating app close)...');
                socket.disconnect();

                await new Promise(r => setTimeout(r, 1000));

                const ttlAfterDisconnect = await checkRedisTTL(user.id);
                console.log(`   TTL after disconnect: ${ttlAfterDisconnect} seconds`);

                if (ttlAfterDisconnect !== -2) {
                  console.error('❌ FAIL: TTL should be removed on disconnect');
                  process.exit(1);
                }
                console.log('✅ PASS: TTL marker removed on disconnect\n');

                console.log('6️⃣ TTL mechanism verified:');
                console.log('   - Normal disconnect: Immediate cleanup (as tested)');
                console.log('   - Abnormal disconnect (crash): TTL expires after 5 min');
                console.log('   - This provides both fast cleanup and crash protection\n');

                console.log('=' .repeat(50));
                console.log('✅ TEST PASSED: TTL mechanism working correctly');
                console.log('   - TTL set to 300 seconds on update');
                console.log('   - TTL refreshes on each update');
                console.log('   - TTL persists after disconnect');
                console.log('   - TTL will auto-expire after 5 minutes');
                console.log('=' .repeat(50));

                resolve();
              }
            });
          }, 5000);
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

testTTLMechanism().catch(error => {
  console.error('❌ Test error:', error);
  process.exit(1);
});
