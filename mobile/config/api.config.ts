// API Configuration
// This file contains the backend server address

// IMPORTANT: Update this when your machine's IP changes
// To find your current IP, run in terminal: ipconfig getifaddr en0

// Option 1: Use your machine's current IP (for testing on physical device)
const MACHINE_IP = '100.64.9.4'; // Update this when IP changes

// Option 2: Use localhost (only works in iOS simulator, not on physical device)
const LOCALHOST = 'localhost';

// Auto-select based on environment
// If you're using iOS Simulator, it can access localhost directly
// If you're using a physical device, it needs the machine's IP address
export const API_BASE_URL = `http://${MACHINE_IP}:3000`;

// For debugging
console.log('[Config] API Base URL:', API_BASE_URL);
