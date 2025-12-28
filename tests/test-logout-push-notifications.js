const io = require('socket.io-client');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const TEST_USER = {
  email: 'central@test.com',
  password: 'TestPass123',
  name: 'User at Central Campus'
};

const LOCATION = { latitude: 42.2776, longitude: -83.7382 };

async function testLogoutDisablesPushNotifications() {
  console.log('🧪 Test: Logout disables push notifications\n');

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

  // Step 2: Connect WebSocket and update location
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

          // Step 3: Check pushNotificationsEnabled = true
          console.log('4️⃣ Checking push notifications status in database...');
          const { stdout } = await execPromise(
            `docker exec bounty-postgres psql -U bounty_user -d bounty_db -t -c "SELECT \\"pushNotificationsEnabled\\" FROM users WHERE id='${user.id}';"`
          );
          const pushEnabled = stdout.trim();
          console.log(`   pushNotificationsEnabled: ${pushEnabled}`);

          if (pushEnabled !== 't') {
            console.error('❌ FAIL: Should be enabled before logout');
            socket.disconnect();
            process.exit(1);
          }
          console.log('✅ PASS: Push notifications enabled\n');

          // Step 4: Logout
          console.log('5️⃣ Sending logout event...');
          socket.emit('logout', {}, async (logoutResponse) => {
            if (logoutResponse.success) {
              console.log('✅ Logout successful\n');

              // Step 5: Check pushNotificationsEnabled = false
              console.log('6️⃣ Checking push notifications status after logout...');
              const { stdout: afterLogout } = await execPromise(
                `docker exec bounty-postgres psql -U bounty_user -d bounty_db -t -c "SELECT \\"pushNotificationsEnabled\\" FROM users WHERE id='${user.id}';"`
              );
              const pushAfterLogout = afterLogout.trim();
              console.log(`   pushNotificationsEnabled: ${pushAfterLogout}`);

              if (pushAfterLogout !== 'f') {
                console.error('❌ FAIL: Should be disabled after logout');
                socket.disconnect();
                process.exit(1);
              }
              console.log('✅ PASS: Push notifications disabled\n');

              // Step 6: Re-enable for next test
              await execPromise(
                `docker exec bounty-postgres psql -U bounty_user -d bounty_db -c "UPDATE users SET \\"pushNotificationsEnabled\\" = true WHERE id='${user.id}';"`
              );
              console.log('🔧 Restored pushNotificationsEnabled for next test\n');

              console.log('=' .repeat(50));
              console.log('✅ TEST PASSED: Logout correctly disables push notifications');
              console.log('=' .repeat(50));

              socket.disconnect();
              resolve();
            } else {
              console.error('❌ Logout failed:', logoutResponse.error);
              socket.disconnect();
              reject();
            }
          });
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

testLogoutDisablesPushNotifications().catch(error => {
  console.error('❌ Test error:', error);
  process.exit(1);
});
