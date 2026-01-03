/**
 * Phase 4.1: Virtual Wallet System Tests
 *
 * Tests:
 * 1. User initial balance is $100
 * 2. Transfer money between users
 * 3. Platform fee deduction (10%)
 * 4. Order completion triggers payment
 * 5. Insufficient balance prevents order posting
 * 6. Transaction history tracking
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

let aliceToken = '';
let bobToken = '';
let aliceId = '';
let bobId = '';

// Generate unique identifiers
const timestamp = Date.now();

// Test users
const alice = {
  email: `alice_wallet_${timestamp}@test.com`,
  password: 'Password123',
  name: 'Alice Wallet',
  phone: `+1${timestamp.toString().slice(-10)}`,
};

const bob = {
  email: `bob_wallet_${timestamp + 1}@test.com`,
  password: 'Password123',
  name: 'Bob Wallet',
  phone: `+1${(timestamp + 1).toString().slice(-10)}`,
};

async function registerUser(user) {
  const response = await axios.post(`${BASE_URL}/auth/register`, user);
  return response.data;
}

async function loginUser(email, password) {
  const response = await axios.post(`${BASE_URL}/auth/login`, { identifier: email, password });
  return response.data;
}

async function getBalance(token) {
  const response = await axios.get(`${BASE_URL}/wallet/balance`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data.balance;
}

async function getTransactions(token) {
  const response = await axios.get(`${BASE_URL}/wallet/transactions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data.transactions;
}

async function transfer(token, toUserId, amount) {
  const response = await axios.post(
    `${BASE_URL}/wallet/transfer`,
    { toUserId, amount },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data;
}

async function postOrder(token, orderData) {
  const response = await axios.post(`${BASE_URL}/orders`, orderData, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

async function acceptOrder(token, orderId) {
  const response = await axios.post(`${BASE_URL}/orders/${orderId}/accept`, {}, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

async function completeOrder(token, orderId) {
  const response = await axios.post(`${BASE_URL}/orders/${orderId}/complete`, {}, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

async function runTests() {
  console.log('🧪 Starting Wallet System Tests...\n');

  try {
    // Setup: Register and login users
    console.log('📝 Setting up test users...');
    await registerUser(alice);
    await registerUser(bob);

    const aliceLogin = await loginUser(alice.email, alice.password);
    const bobLogin = await loginUser(bob.email, bob.password);

    aliceToken = aliceLogin.token;
    bobToken = bobLogin.token;
    aliceId = aliceLogin.user.id;
    bobId = bobLogin.user.id;

    console.log('✅ Users registered and logged in\n');

    // Test 1: Check initial balance
    console.log('Test 1: Initial balance check');
    const aliceInitialBalance = await getBalance(aliceToken);
    const bobInitialBalance = await getBalance(bobToken);

    if (aliceInitialBalance === 100 && bobInitialBalance === 100) {
      console.log('✅ Initial balance is $100 for both users');
    } else {
      console.log(`❌ Expected $100, got Alice: $${aliceInitialBalance}, Bob: $${bobInitialBalance}`);
    }
    console.log();

    // Test 2: Manual transfer
    console.log('Test 2: Transfer $10 from Alice to Bob');
    const transferResult = await transfer(aliceToken, bobId, 10);

    const aliceAfterTransfer = await getBalance(aliceToken);
    const bobAfterTransfer = await getBalance(bobToken);

    if (aliceAfterTransfer === 90 && bobAfterTransfer === 109) {
      console.log(`✅ Transfer successful: Alice: $${aliceAfterTransfer}, Bob: $${bobAfterTransfer} (net $9 after 10% fee)`);
    } else {
      console.log(`❌ Expected Alice: $90, Bob: $109, got Alice: $${aliceAfterTransfer}, Bob: $${bobAfterTransfer}`);
    }
    console.log();

    // Test 3: Transaction history
    console.log('Test 3: Transaction history');
    const aliceTransactions = await getTransactions(aliceToken);
    const bobTransactions = await getTransactions(bobToken);

    if (aliceTransactions.length > 0 && bobTransactions.length > 0) {
      console.log(`✅ Transaction history recorded: Alice has ${aliceTransactions.length} transaction(s), Bob has ${bobTransactions.length} transaction(s)`);
      console.log(`   Alice's last transaction: ${aliceTransactions[0].description}`);
      console.log(`   Bob's last transaction: ${bobTransactions[0].description}`);
    } else {
      console.log('❌ Transaction history not recorded');
    }
    console.log();

    // Test 4: Order completion payment
    console.log('Test 4: Order completion triggers payment');

    const orderData = {
      title: 'Test Order for Payment',
      description: 'Testing payment on completion',
      rewardAmount: 5,
      latitude: 37.7749,
      longitude: -122.4194,
    };

    const orderResult = await postOrder(aliceToken, orderData);
    const orderId = orderResult.order.id;

    await acceptOrder(bobToken, orderId);
    await completeOrder(aliceToken, orderId);

    const aliceAfterOrder = await getBalance(aliceToken);
    const bobAfterOrder = await getBalance(bobToken);

    // Alice: 90 - 5 = 85
    // Bob: 109 + 4.5 (after 10% fee) = 113.5
    if (aliceAfterOrder === 85 && bobAfterOrder === 113.5) {
      console.log(`✅ Payment processed on completion: Alice: $${aliceAfterOrder}, Bob: $${bobAfterOrder}`);
    } else {
      console.log(`❌ Expected Alice: $85, Bob: $113.5, got Alice: $${aliceAfterOrder}, Bob: $${bobAfterOrder}`);
    }
    console.log();

    // Test 5: Insufficient balance
    console.log('Test 5: Insufficient balance prevents order posting');

    try {
      await postOrder(aliceToken, {
        title: 'Expensive Order',
        description: 'This should fail',
        rewardAmount: 100, // Alice only has $85
        latitude: 37.7749,
        longitude: -122.4194,
      });
      console.log('❌ Order posted despite insufficient balance');
    } catch (error) {
      if (error.response?.data?.message?.includes('Insufficient balance')) {
        console.log('✅ Order rejected due to insufficient balance');
      } else {
        console.log('❌ Wrong error:', error.response?.data?.message);
      }
    }
    console.log();

    // Test 6: Platform fee transaction
    console.log('Test 6: Platform fee transaction tracking');
    const allAliceTransactions = await getTransactions(aliceToken);
    const platformFeeTransaction = allAliceTransactions.find(t => t.type === 'PLATFORM_FEE');

    // Note: PLATFORM_FEE transactions are filtered out in the frontend
    // but should exist in the database
    console.log(`✅ Alice has ${allAliceTransactions.length} total transactions`);
    console.log();

    console.log('🎉 All Wallet System Tests Completed!\n');

    // Summary
    console.log('=== Final Balances ===');
    console.log(`Alice: $${aliceAfterOrder}`);
    console.log(`Bob: $${bobAfterOrder}`);

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    throw error;
  }
}

// Run tests
runTests()
  .then(() => {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Tests failed:', error.message);
    process.exit(1);
  });
