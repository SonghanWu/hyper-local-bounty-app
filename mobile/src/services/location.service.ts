import * as Location from 'expo-location';
import websocketService from './websocket.service';
import geofencingService from './geofencing.service';

export interface UserLocation {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: number;
}

class LocationService {
  private watchSubscription: Location.LocationSubscription | null = null;
  private lastUpdateTime = 0;
  private updateInterval = 5000; // Update every 5 seconds
  private isTracking = false;

  /**
   * Request location permissions from user
   */
  async requestPermissions(): Promise<boolean> {
    try {
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();

      if (foregroundStatus !== 'granted') {
        console.error('❌ Foreground location permission denied');
        return false;
      }

      console.log('✅ Location permissions granted');
      return true;
    } catch (error) {
      console.error('❌ Failed to request location permissions:', error);
      return false;
    }
  }

  /**
   * Get current location once
   */
  async getCurrentLocation(): Promise<UserLocation | null> {
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
        timestamp: location.timestamp,
      };
    } catch (error) {
      console.error('❌ Failed to get current location:', error);
      return null;
    }
  }

  /**
   * Start continuous location tracking
   */
  async startTracking(): Promise<boolean> {
    if (this.isTracking) {
      console.log('⚠️ Location tracking already started');
      return true;
    }

    try {
      // Check permissions first
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        return false;
      }

      console.log('🎯 Starting location tracking...');

      this.watchSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: this.updateInterval,
          distanceInterval: 10, // Update if moved 10 meters
        },
        (location) => {
          this.handleLocationUpdate(location);
        }
      );

      this.isTracking = true;
      console.log('✅ Location tracking started');
      return true;
    } catch (error) {
      console.error('❌ Failed to start location tracking:', error);
      return false;
    }
  }

  /**
   * Handle location updates
   */
  private handleLocationUpdate(location: Location.LocationObject) {
    const now = Date.now();

    // Throttle updates to avoid sending too frequently
    if (now - this.lastUpdateTime < this.updateInterval) {
      return;
    }

    const { latitude, longitude, accuracy } = location.coords;

    console.log(`📍 Location update: (${latitude.toFixed(6)}, ${longitude.toFixed(6)}), accuracy: ${accuracy?.toFixed(1)}m`);

    // Check geofencing for monitored orders
    geofencingService.checkLocation({ latitude, longitude });

    // Send location to backend via WebSocket
    websocketService.updateLocation(latitude, longitude)
      .then((success) => {
        if (success) {
          this.lastUpdateTime = now;
        }
      })
      .catch((error) => {
        console.error('❌ Failed to send location update:', error);
      });
  }

  /**
   * Stop location tracking
   */
  async stopTracking() {
    if (this.watchSubscription) {
      this.watchSubscription.remove();
      this.watchSubscription = null;
      this.isTracking = false;
      console.log('🛑 Location tracking stopped');
    }
  }

  /**
   * Get tracking status
   */
  isLocationTracking(): boolean {
    return this.isTracking;
  }

  /**
   * Set update interval (in milliseconds)
   */
  setUpdateInterval(interval: number) {
    this.updateInterval = interval;
    console.log(`⏱️ Location update interval set to ${interval}ms`);
  }
}

// Export singleton instance
export default new LocationService();
