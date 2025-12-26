import { io, Socket } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';

const BACKEND_URL = 'http://100.64.13.57:3000'; // Backend server URL

export interface LocationUpdate {
  latitude: number;
  longitude: number;
}

export interface NearbyUser {
  member: string;
  distance: string;
  coordinates: {
    latitude: string;
    longitude: string;
  };
}

export interface NearbyUsersResponse {
  success: boolean;
  users: NearbyUser[];
  error?: string;
}

class WebSocketService {
  private socket: Socket | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  /**
   * Initialize WebSocket connection with JWT token
   */
  async connect(): Promise<boolean> {
    try {
      // Get JWT token from SecureStore (same as api.ts)
      const token = await SecureStore.getItemAsync('token');

      if (!token) {
        console.error('❌ No auth token found');
        return false;
      }

      // Create socket connection
      this.socket = io(BACKEND_URL, {
        auth: { token },
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: this.maxReconnectAttempts,
      });

      // Setup event listeners
      this.setupEventListeners();

      return new Promise((resolve) => {
        this.socket?.on('connect', () => {
          console.log('✅ WebSocket connected');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          resolve(true);
        });

        this.socket?.on('connect_error', (error) => {
          console.error('❌ WebSocket connection error:', error.message);
          this.isConnected = false;
          resolve(false);
        });
      });
    } catch (error) {
      console.error('❌ Failed to connect WebSocket:', error);
      return false;
    }
  }

  /**
   * Setup WebSocket event listeners
   */
  private setupEventListeners() {
    if (!this.socket) return;

    this.socket.on('disconnect', (reason) => {
      console.log('⚠️ WebSocket disconnected:', reason);
      this.isConnected = false;
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log(`✅ WebSocket reconnected after ${attemptNumber} attempts`);
      this.isConnected = true;
      this.reconnectAttempts = 0;
    });

    this.socket.on('reconnect_attempt', (attemptNumber) => {
      this.reconnectAttempts = attemptNumber;
      console.log(`🔄 WebSocket reconnection attempt ${attemptNumber}/${this.maxReconnectAttempts}`);
    });

    this.socket.on('reconnect_failed', () => {
      console.error('❌ WebSocket reconnection failed after max attempts');
      this.isConnected = false;
    });
  }

  /**
   * Update user's location
   */
  async updateLocation(latitude: number, longitude: number): Promise<boolean> {
    if (!this.socket || !this.isConnected) {
      console.error('❌ WebSocket not connected');
      return false;
    }

    return new Promise((resolve) => {
      this.socket?.emit(
        'update_location',
        { latitude, longitude },
        (response: any) => {
          if (response.success) {
            console.log('📍 Location updated successfully');
            resolve(true);
          } else {
            console.error('❌ Failed to update location:', response.error);
            resolve(false);
          }
        }
      );
    });
  }

  /**
   * Get nearby users within radius
   */
  async getNearbyUsers(
    latitude: number,
    longitude: number,
    radius: number = 500
  ): Promise<NearbyUsersResponse> {
    if (!this.socket || !this.isConnected) {
      console.error('❌ WebSocket not connected');
      return { success: false, users: [], error: 'Not connected' };
    }

    return new Promise((resolve) => {
      this.socket?.emit(
        'get_nearby_users',
        { latitude, longitude, radius },
        (response: NearbyUsersResponse) => {
          if (response.success) {
            console.log(`📊 Found ${response.users.length} nearby users`);
            resolve(response);
          } else {
            console.error('❌ Failed to get nearby users:', response.error);
            resolve({ success: false, users: [], error: response.error });
          }
        }
      );
    });
  }

  /**
   * Disconnect WebSocket
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      console.log('🔌 WebSocket disconnected');
    }
  }

  /**
   * Check if WebSocket is connected
   */
  getConnectionStatus(): boolean {
    return this.isConnected;
  }
}

// Export singleton instance
export default new WebSocketService();
