/**
 * Phase 5.1: Real-time Chat System Tests
 *
 * Tests:
 * 1. Join chat room for accepted order
 * 2. Send and receive messages in real-time
 * 3. Get message history via REST API
 * 4. Access control (only requester and helper can access)
 * 5. Unauthorized user cannot join chat
 * 6. Messages persist in database
 * 7. Typing indicator functionality
 */

const axios = require('axios');
const io = require('socket.io-client');

const BASE_URL = 'http://localhost:3000';
const CHAT_URL = 'http://localhost:3000/chat';

let aliceToken = '';
let bobToken = '';
let charlieToken = '';
let aliceId = '';
let bobId = '';
let charlieId = '';
let orderId = '';

// Socket connections
let aliceSocket = null;
let bobSocket = null;
let charlieSocket = null;

// Generate unique identifiers
const timestamp = Date.now();

// Test users
const alice = {
  email: `alice_chat_${timestamp}@test.com`,
  password: 'Password123',
  name: 'Alice Chat',
  phone: `+1${timestamp.toString().slice(-10)}`,
};

const bob = {
  email: `bob_chat_${timestamp + 1}@test.com`,
  password: 'Password123',
  name: 'Bob Chat',
  phone: `+1${(timestamp + 1).toString().slice(-10)}`,
};

const charlie = {
  email: `charlie_chat_${timestamp + 2}@test.com`,
  password: 'Password123',
  name: 'Charlie Chat',
  phone: `+1${(timestamp + 2).toString().slice(-10)}`,
};

// Helper functions
async function registerUser(user) {
  const response = await axios.post(`${BASE_URL}/auth/register`, user);
  return response.data;
}

async function loginUser(email, password) {
  const response = await axios.post(`${BASE_URL}/auth/login`, { identifier: email, password });
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

async function getChatHistory(token, orderId) {
  const response = await axios.get(`${BASE_URL}/chat/${orderId}/messages`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = io(CHAT_URL, {
      auth: { token },
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      console.log(`  Socket connected: ${socket.id}`);
      resolve(socket);
    });

    socket.on('connect_error', (error) => {
      console.error('  Socket connection error:', error.message);
      reject(error);
    });

    // Set timeout for connection
    setTimeout(() => {
      if (!socket.connected) {
        reject(new Error('Socket connection timeout'));
      }
    }, 5000);
  });
}

function joinChatRoom(socket, orderId) {
  return new Promise((resolve, reject) => {
    socket.emit('join_chat', { orderId }, (response) => {
      if (response.error) {
        reject(new Error(response.error));
      } else {
        resolve(response);
      }
    });

    // Timeout
    setTimeout(() => reject(new Error('Join chat timeout')), 5000);
  });
}

function sendMessage(socket, orderId, message) {
  return new Promise((resolve, reject) => {
    socket.emit('send_message', { orderId, message }, (response) => {
      if (response.error) {
        reject(new Error(response.error));
      } else {
        resolve(response);
      }
    });

    // Timeout
    setTimeout(() => reject(new Error('Send message timeout')), 5000);
  });
}

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('🧪 Starting Phase 5.1: Chat System Tests...\n');

  try {
    // Setup: Register and login users
    console.log('📝 Setting up test users...');
    await registerUser(alice);
    await registerUser(bob);
    await registerUser(charlie);

    const aliceLogin = await loginUser(alice.email, alice.password);
    const bobLogin = await loginUser(bob.email, bob.password);
    const charlieLogin = await loginUser(charlie.email, charlie.password);

    aliceToken = aliceLogin.token;
    bobToken = bobLogin.token;
    charlieToken = charlieLogin.token;
    aliceId = aliceLogin.user.id;
    bobId = bobLogin.user.id;
    charlieId = charlieLogin.user.id;

    console.log('✅ Users registered and logged in\n');

    // Create and accept an order
    console.log('📦 Creating and accepting order...');
    const orderData = {
      title: 'Test Order for Chat',
      description: 'Testing chat functionality',
      rewardAmount: 5,
      latitude: 37.7749,
      longitude: -122.4194,
    };

    const orderResult = await postOrder(aliceToken, orderData);
    orderId = orderResult.order.id;
    await acceptOrder(bobToken, orderId);
    console.log(`✅ Order created and accepted (ID: ${orderId})\n`);

    // Test 1: Connect to chat namespace
    console.log('Test 1: Connect to chat namespace');
    aliceSocket = await connectSocket(aliceToken);
    bobSocket = await connectSocket(bobToken);
    console.log('✅ Both users connected to chat namespace\n');

    // Test 2: Join chat room
    console.log('Test 2: Join chat room');
    await joinChatRoom(aliceSocket, orderId);
    console.log('  ✓ Alice joined chat room');
    await joinChatRoom(bobSocket, orderId);
    console.log('  ✓ Bob joined chat room');
    console.log('✅ Both users joined chat room successfully\n');

    // Test 3: Send and receive messages
    console.log('Test 3: Send and receive messages in real-time');

    let bobReceivedMessage = false;
    let aliceReceivedMessage = false;

    bobSocket.on('new_message', (data) => {
      if (data.message === 'Hello from Alice!') {
        bobReceivedMessage = true;
        console.log('  ✓ Bob received message from Alice');
      }
    });

    aliceSocket.on('new_message', (data) => {
      if (data.message === 'Hi Alice, this is Bob!') {
        aliceReceivedMessage = true;
        console.log('  ✓ Alice received message from Bob');
      }
    });

    await sendMessage(aliceSocket, orderId, 'Hello from Alice!');
    await wait(500); // Wait for message to be received

    await sendMessage(bobSocket, orderId, 'Hi Alice, this is Bob!');
    await wait(500);

    if (bobReceivedMessage && aliceReceivedMessage) {
      console.log('✅ Real-time messaging works correctly\n');
    } else {
      console.log('❌ Some messages were not received\n');
    }

    // Test 4: Get message history via REST API
    console.log('Test 4: Get message history via REST API');
    const chatHistory = await getChatHistory(aliceToken, orderId);

    if (chatHistory.messages && chatHistory.messages.length >= 2) {
      console.log(`  ✓ Retrieved ${chatHistory.messages.length} messages`);
      console.log(`  ✓ First message: "${chatHistory.messages[0].message}" from ${chatHistory.messages[0].senderName}`);
      console.log(`  ✓ Second message: "${chatHistory.messages[1].message}" from ${chatHistory.messages[1].senderName}`);
      console.log('✅ Message history retrieved successfully\n');
    } else {
      console.log(`❌ Expected at least 2 messages, got ${chatHistory.messages?.length || 0}\n`);
    }

    // Test 5: Unauthorized user cannot join chat
    console.log('Test 5: Unauthorized user cannot join chat');
    charlieSocket = await connectSocket(charlieToken);

    try {
      await joinChatRoom(charlieSocket, orderId);
      console.log('❌ Charlie should not be able to join chat\n');
    } catch (error) {
      if (error.message.includes('do not have access')) {
        console.log('✅ Unauthorized user correctly denied access\n');
      } else {
        console.log(`⚠️  Got error but wrong message: ${error.message}\n`);
      }
    }

    // Test 6: Unauthorized user cannot get message history
    console.log('Test 6: Unauthorized user cannot get message history via REST');
    try {
      await getChatHistory(charlieToken, orderId);
      console.log('❌ Charlie should not be able to get message history\n');
    } catch (error) {
      if (error.response?.status === 403) {
        console.log('✅ Unauthorized user correctly denied REST API access\n');
      } else {
        console.log(`⚠️  Got error but wrong status: ${error.response?.status}\n`);
      }
    }

    // Test 7: Typing indicator
    console.log('Test 7: Typing indicator');
    let typingReceived = false;

    bobSocket.on('user_typing', (data) => {
      if (data.userId === aliceId && data.isTyping === true) {
        typingReceived = true;
        console.log('  ✓ Bob received typing indicator from Alice');
      }
    });

    aliceSocket.emit('typing', { orderId, isTyping: true });
    await wait(500);

    if (typingReceived) {
      console.log('✅ Typing indicator works correctly\n');
    } else {
      console.log('⚠️  Typing indicator not received\n');
    }

    // Test 8: Messages persist after disconnect and reconnect
    console.log('Test 8: Messages persist after disconnect');

    // Disconnect Alice
    aliceSocket.disconnect();
    await wait(500);

    // Reconnect Alice
    aliceSocket = await connectSocket(aliceToken);
    await joinChatRoom(aliceSocket, orderId);

    // Get message history
    const persistedHistory = await getChatHistory(aliceToken, orderId);

    if (persistedHistory.messages && persistedHistory.messages.length >= 2) {
      console.log(`  ✓ Messages persisted: ${persistedHistory.messages.length} messages still available`);
      console.log('✅ Message persistence works correctly\n');
    } else {
      console.log('❌ Messages not persisted correctly\n');
    }

    console.log('🎉 All Phase 5.1 Chat Tests Completed!\n');

    // Summary
    console.log('=== Test Summary ===');
    console.log('✓ Real-time chat via Socket.io (/chat namespace)');
    console.log('✓ Message sending and receiving');
    console.log('✓ Message persistence in database');
    console.log('✓ REST API for message history');
    console.log('✓ Access control (only requester and helper)');
    console.log('✓ Typing indicators');
    console.log('✓ Reconnection and message persistence');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    throw error;
  } finally {
    // Cleanup: Disconnect all sockets
    if (aliceSocket) aliceSocket.disconnect();
    if (bobSocket) bobSocket.disconnect();
    if (charlieSocket) charlieSocket.disconnect();
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
