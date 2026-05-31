const PRODUCTION_URL = 'https://api.pin-gig.com';

// Local development options
const MACHINE_IP = '100.64.1.131';
const LOCALHOST = 'localhost';

const IS_PRODUCTION = true; // Set to false for local development
const USE_LOCALHOST = false; // Set to true for iOS simulator

export const API_BASE_URL = IS_PRODUCTION
  ? PRODUCTION_URL
  : USE_LOCALHOST
  ? `http://${LOCALHOST}:3000`
  : `http://${MACHINE_IP}:3000`;

console.log('[Config] API Base URL:', API_BASE_URL);
