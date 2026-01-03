const axios = require('axios');

const API_URL = 'http://localhost:3000';

// Test users
let requesterToken = '';
let helperToken = '';
let requesterUserId = '';
let helperUserId = '';

// Test order ID
let testOrderId = '';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Setup: Register and login two users
async function setup() {
  log('\n=== PHASE 3 ORDERS SYSTEM TEST ===\n', 'cyan');
  log('Setting up test users...', 'blue');

  try {
    const timestamp = Date.now();

    // Register requester
    const requesterEmail = `requester_${timestamp}@test.com`;
    const requesterRes = await axios.post(`${API_URL}/auth/register`, {
      email: requesterEmail,
      password: 'Test1234',
      name: 'Test Requester',
      phone: `+1${timestamp.toString().slice(-10)}`,
    });
    requesterToken = requesterRes.data.token;
    requesterUserId = requesterRes.data.user.id;
    log(`✓ Requester registered: ${requesterEmail}`, 'green');

    await sleep(100); // Small delay to ensure different timestamp
    const timestamp2 = Date.now();

    // Register helper
    const helperEmail = `helper_${timestamp2}@test.com`;
    const helperRes = await axios.post(`${API_URL}/auth/register`, {
      email: helperEmail,
      password: 'Test1234',
      name: 'Test Helper',
      phone: `+1${timestamp2.toString().slice(-10)}`,
    });
    helperToken = helperRes.data.token;
    helperUserId = helperRes.data.user.id;
    log(`✓ Helper registered: ${helperEmail}`, 'green');

    await sleep(500);
  } catch (error) {
    log(`✗ Setup failed: ${error.message}`, 'red');
    process.exit(1);
  }
}

// Test 1: Create Order
async function testCreateOrder() {
  log('\n--- Test 1: Create Order ---', 'yellow');

  try {
    const response = await axios.post(
      `${API_URL}/orders`,
      {
        title: 'Need a phone charger',
        description: 'My phone is dying, need to borrow a charger for 30 minutes',
        rewardAmount: 5,
        latitude: 42.2776,
        longitude: -83.7382,
      },
      {
        headers: { Authorization: `Bearer ${requesterToken}` },
      }
    );

    if (response.data.success && response.data.order) {
      testOrderId = response.data.order.id;
      log(`✓ Order created successfully: ${testOrderId}`, 'green');
      log(`  Status: ${response.data.order.status}`, 'cyan');
      return true;
    } else {
      log('✗ Order creation failed: Invalid response', 'red');
      return false;
    }
  } catch (error) {
    log(`✗ Order creation failed: ${error.response?.data?.message || error.message}`, 'red');
    return false;
  }
}

// Test 2: Get Nearby Orders
async function testGetNearbyOrders() {
  log('\n--- Test 2: Get Nearby Orders ---', 'yellow');

  try {
    const response = await axios.get(`${API_URL}/orders/nearby`, {
      params: {
        latitude: 42.2776,
        longitude: -83.7382,
        radius: 5000, // 5km
      },
      headers: { Authorization: `Bearer ${helperToken}` },
    });

    if (response.data.success) {
      log(`✓ Found ${response.data.count} nearby orders`, 'green');
      const hasTestOrder = response.data.orders.some((o) => o.id === testOrderId);
      if (hasTestOrder) {
        log('✓ Test order found in nearby results', 'green');
        return true;
      } else {
        log('✗ Test order not found in nearby results', 'red');
        return false;
      }
    } else {
      log('✗ Failed to get nearby orders', 'red');
      return false;
    }
  } catch (error) {
    log(`✗ Get nearby orders failed: ${error.response?.data?.message || error.message}`, 'red');
    return false;
  }
}

// Test 3: Get Order by ID
async function testGetOrderById() {
  log('\n--- Test 3: Get Order by ID ---', 'yellow');

  try {
    const response = await axios.get(`${API_URL}/orders/${testOrderId}`, {
      headers: { Authorization: `Bearer ${helperToken}` },
    });

    if (response.data.success && response.data.order) {
      log('✓ Order retrieved successfully', 'green');
      log(`  Title: ${response.data.order.title}`, 'cyan');
      log(`  Status: ${response.data.order.status}`, 'cyan');
      log(`  Reward: $${response.data.order.rewardAmount}`, 'cyan');
      return true;
    } else {
      log('✗ Failed to get order by ID', 'red');
      return false;
    }
  } catch (error) {
    log(`✗ Get order by ID failed: ${error.response?.data?.message || error.message}`, 'red');
    return false;
  }
}

// Test 4: Accept Order
async function testAcceptOrder() {
  log('\n--- Test 4: Accept Order ---', 'yellow');

  try {
    const response = await axios.post(
      `${API_URL}/orders/${testOrderId}/accept`,
      {},
      {
        headers: { Authorization: `Bearer ${helperToken}` },
      }
    );

    if (response.data.success) {
      log('✓ Order accepted successfully', 'green');
      log(`  Status: ${response.data.order.status}`, 'cyan');
      return true;
    } else {
      log('✗ Failed to accept order', 'red');
      return false;
    }
  } catch (error) {
    log(`✗ Accept order failed: ${error.response?.data?.message || error.message}`, 'red');
    return false;
  }
}

// Test 5: Concurrent Accept (should fail)
async function testConcurrentAccept() {
  log('\n--- Test 5: Concurrent Accept Prevention ---', 'yellow');

  try {
    // Try to accept already accepted order
    await axios.post(
      `${API_URL}/orders/${testOrderId}/accept`,
      {},
      {
        headers: { Authorization: `Bearer ${helperToken}` },
      }
    );

    log('✗ Concurrent accept should have been prevented', 'red');
    return false;
  } catch (error) {
    if (error.response?.status === 400) {
      log('✓ Concurrent accept prevented successfully', 'green');
      log(`  Message: ${error.response.data.message}`, 'cyan');
      return true;
    } else {
      log(`✗ Unexpected error: ${error.message}`, 'red');
      return false;
    }
  }
}

// Test 6: Get My Orders
async function testGetMyOrders() {
  log('\n--- Test 6: Get My Orders ---', 'yellow');

  try {
    const response = await axios.get(`${API_URL}/orders/my-orders`, {
      headers: { Authorization: `Bearer ${requesterToken}` },
    });

    if (response.data.success) {
      log(`✓ Retrieved ${response.data.count} orders`, 'green');
      const hasTestOrder = response.data.orders.some((o) => o.id === testOrderId);
      if (hasTestOrder) {
        log('✓ Test order found in my orders', 'green');
        return true;
      } else {
        log('✗ Test order not found in my orders', 'red');
        return false;
      }
    } else {
      log('✗ Failed to get my orders', 'red');
      return false;
    }
  } catch (error) {
    log(`✗ Get my orders failed: ${error.response?.data?.message || error.message}`, 'red');
    return false;
  }
}

// Test 7: Edit Order (should fail - order is ACCEPTED)
async function testEditOrderWhileAccepted() {
  log('\n--- Test 7: Edit Order (ACCEPTED - should fail) ---', 'yellow');

  try {
    await axios.put(
      `${API_URL}/orders/${testOrderId}`,
      {
        title: 'Updated title',
        rewardAmount: 10,
      },
      {
        headers: { Authorization: `Bearer ${requesterToken}` },
      }
    );

    log('✗ Should not be able to edit ACCEPTED order', 'red');
    return false;
  } catch (error) {
    if (error.response?.status === 400) {
      log('✓ Cannot edit ACCEPTED order (as expected)', 'green');
      log(`  Message: ${error.response.data.message}`, 'cyan');
      return true;
    } else {
      log(`✗ Unexpected error: ${error.message}`, 'red');
      return false;
    }
  }
}

// Test 8: Helper Cancel (should return to PENDING)
async function testHelperCancel() {
  log('\n--- Test 8: Helper Cancel Order ---', 'yellow');

  try {
    const response = await axios.post(
      `${API_URL}/orders/${testOrderId}/cancel`,
      {},
      {
        headers: { Authorization: `Bearer ${helperToken}` },
      }
    );

    if (response.data.success) {
      log('✓ Helper cancelled order successfully', 'green');
      log(`  New status: ${response.data.order.status}`, 'cyan');

      if (response.data.order.status === 'PENDING') {
        log('✓ Order returned to PENDING (helper can re-accept)', 'green');
        return true;
      } else {
        log('✗ Order status should be PENDING after helper cancel', 'red');
        return false;
      }
    } else {
      log('✗ Failed to cancel order', 'red');
      return false;
    }
  } catch (error) {
    log(`✗ Cancel order failed: ${error.response?.data?.message || error.message}`, 'red');
    return false;
  }
}

// Test 9: Edit Order (PENDING - should succeed)
async function testEditOrderWhilePending() {
  log('\n--- Test 9: Edit Order (PENDING - should succeed) ---', 'yellow');

  try {
    const response = await axios.put(
      `${API_URL}/orders/${testOrderId}`,
      {
        title: 'Need a phone charger (UPDATED)',
        description: 'Updated description',
        rewardAmount: 8,
      },
      {
        headers: { Authorization: `Bearer ${requesterToken}` },
      }
    );

    if (response.data.success) {
      log('✓ Order edited successfully', 'green');
      log(`  New title: ${response.data.order.title}`, 'cyan');
      log(`  New reward: $${response.data.order.rewardAmount}`, 'cyan');
      return true;
    } else {
      log('✗ Failed to edit order', 'red');
      return false;
    }
  } catch (error) {
    log(`✗ Edit order failed: ${error.response?.data?.message || error.message}`, 'red');
    return false;
  }
}

// Test 10: Accept Order Again
async function testAcceptOrderAgain() {
  log('\n--- Test 10: Accept Order Again (after helper cancel) ---', 'yellow');

  try {
    const response = await axios.post(
      `${API_URL}/orders/${testOrderId}/accept`,
      {},
      {
        headers: { Authorization: `Bearer ${helperToken}` },
      }
    );

    if (response.data.success) {
      log('✓ Order accepted again successfully', 'green');
      log(`  Status: ${response.data.order.status}`, 'cyan');
      return true;
    } else {
      log('✗ Failed to accept order again', 'red');
      return false;
    }
  } catch (error) {
    log(`✗ Accept order again failed: ${error.response?.data?.message || error.message}`, 'red');
    return false;
  }
}

// Test 11: Complete Order
async function testCompleteOrder() {
  log('\n--- Test 11: Complete Order ---', 'yellow');

  try {
    const response = await axios.post(
      `${API_URL}/orders/${testOrderId}/complete`,
      {},
      {
        headers: { Authorization: `Bearer ${requesterToken}` },
      }
    );

    if (response.data.success) {
      log('✓ Order completed successfully', 'green');
      log(`  Status: ${response.data.order.status}`, 'cyan');
      return true;
    } else {
      log('✗ Failed to complete order', 'red');
      return false;
    }
  } catch (error) {
    log(`✗ Complete order failed: ${error.response?.data?.message || error.message}`, 'red');
    return false;
  }
}

// Test 12: Requester Cancel COMPLETED Order (should fail)
async function testCancelCompletedOrder() {
  log('\n--- Test 12: Cancel COMPLETED Order (should fail) ---', 'yellow');

  try {
    await axios.post(
      `${API_URL}/orders/${testOrderId}/cancel`,
      {},
      {
        headers: { Authorization: `Bearer ${requesterToken}` },
      }
    );

    log('✗ Should not be able to cancel COMPLETED order', 'red');
    return false;
  } catch (error) {
    if (error.response?.status === 400) {
      log('✓ Cannot cancel COMPLETED order (as expected)', 'green');
      log(`  Message: ${error.response.data.message}`, 'cyan');
      return true;
    } else {
      log(`✗ Unexpected error: ${error.message}`, 'red');
      return false;
    }
  }
}

// Test 13: Requester Cancel and Reactivate
async function testRequesterCancelAndReactivate() {
  log('\n--- Test 13: Requester Cancel and Reactivate via Edit ---', 'yellow');

  try {
    // Create a new order for this test
    const createRes = await axios.post(
      `${API_URL}/orders`,
      {
        title: 'Test Reactivation',
        description: 'This order will be cancelled and reactivated',
        rewardAmount: 3,
        latitude: 42.2776,
        longitude: -83.7382,
      },
      {
        headers: { Authorization: `Bearer ${requesterToken}` },
      }
    );

    const newOrderId = createRes.data.order.id;
    log(`✓ Created test order: ${newOrderId}`, 'green');

    // Requester cancels order
    const cancelRes = await axios.post(
      `${API_URL}/orders/${newOrderId}/cancel`,
      {},
      {
        headers: { Authorization: `Bearer ${requesterToken}` },
      }
    );

    if (cancelRes.data.order.status === 'CANCELLED') {
      log('✓ Order cancelled by requester', 'green');
    } else {
      log('✗ Order should be CANCELLED', 'red');
      return false;
    }

    // Edit cancelled order to reactivate
    const editRes = await axios.put(
      `${API_URL}/orders/${newOrderId}`,
      {
        title: 'Test Reactivation (REACTIVATED)',
        rewardAmount: 5,
      },
      {
        headers: { Authorization: `Bearer ${requesterToken}` },
      }
    );

    if (editRes.data.order.status === 'PENDING') {
      log('✓ CANCELLED order reactivated to PENDING via edit', 'green');
      return true;
    } else {
      log('✗ Order should be PENDING after edit', 'red');
      return false;
    }
  } catch (error) {
    log(`✗ Test failed: ${error.response?.data?.message || error.message}`, 'red');
    return false;
  }
}

// Run all tests
async function runTests() {
  await setup();

  const tests = [
    testCreateOrder,
    testGetNearbyOrders,
    testGetOrderById,
    testAcceptOrder,
    testConcurrentAccept,
    testGetMyOrders,
    testEditOrderWhileAccepted,
    testHelperCancel,
    testEditOrderWhilePending,
    testAcceptOrderAgain,
    testCompleteOrder,
    testCancelCompletedOrder,
    testRequesterCancelAndReactivate,
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    const result = await test();
    if (result) {
      passed++;
    } else {
      failed++;
    }
    await sleep(500);
  }

  // Summary
  log('\n=== TEST SUMMARY ===', 'cyan');
  log(`Total: ${tests.length}`, 'blue');
  log(`Passed: ${passed}`, 'green');
  log(`Failed: ${failed}`, 'red');

  if (failed === 0) {
    log('\n🎉 All Phase 3 tests passed!', 'green');
    process.exit(0);
  } else {
    log('\n❌ Some tests failed', 'red');
    process.exit(1);
  }
}

runTests();
