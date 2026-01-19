// API Configuration
// This file contains the backend server address

// IMPORTANT: When using ngrok for Expo publishing, update NGROK_URL
// To get ngrok URL: run 'ngrok http 3000' and copy the https URL

// Option 1: Local development with machine IP (for testing on physical device)
const MACHINE_IP = '100.64.1.131'; // Update this when IP changes

// Option 2: Use localhost (only works in iOS simulator)
const LOCALHOST = 'localhost';

// Option 3: ngrok URL for public access (for Expo publishing)
// Replace with your ngrok URL when using: npx expo publish
const NGROK_URL = 'https://neomi-sanious-rosamond.ngrok-free.dev'; // ngrok tunnel active

// Select environment
// Use ngrok: cross-network testing (slower, but works anywhere)
// Use LAN: same WiFi testing (faster, but requires same network)
const USE_NGROK = false; // ✅ Set to false for same-WiFi testing
const USE_LOCALHOST = false; // Set to true for iOS simulator

export const API_BASE_URL = USE_NGROK
  ? NGROK_URL
  : USE_LOCALHOST
  ? `http://${LOCALHOST}:3000`
  : `http://${MACHINE_IP}:3000`;

// For debugging
console.log('[Config] API Base URL:', API_BASE_URL);
