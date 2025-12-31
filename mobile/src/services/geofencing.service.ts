import * as Notifications from 'expo-notifications';
import { Alert } from 'react-native';

export interface GeofenceSettings {
  enabled: boolean;
  alertDistance: number; // meters
  autoPromptCancel: boolean;
  notificationEnabled: boolean;
}

interface MonitoredOrder {
  latitude: number;
  longitude: number;
  maxDistance: number;
  title: string;
  lastAlertTime: number; // Prevent alert spam
}

class GeofencingService {
  private monitoredOrders: Map<string, MonitoredOrder> = new Map();
  private settings: GeofenceSettings = {
    enabled: true,
    alertDistance: 500, // Default 500m
    autoPromptCancel: true,
    notificationEnabled: true,
  };
  private alertCooldown = 60000; // Alert once per minute per order

  /**
   * Initialize notification permissions
   */
  async initialize() {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('⚠️ Notification permission not granted');
        return false;
      }

      // Configure notification handler
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });

      console.log('✅ Geofencing notifications initialized');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize notifications:', error);
      return false;
    }
  }

  /**
   * Start monitoring an order
   */
  startMonitoring(
    orderId: string,
    orderLocation: { latitude: number; longitude: number },
    title: string,
    maxDistance?: number
  ) {
    if (!this.settings.enabled) {
      console.log('⚠️ Geofencing is disabled');
      return;
    }

    this.monitoredOrders.set(orderId, {
      latitude: orderLocation.latitude,
      longitude: orderLocation.longitude,
      maxDistance: maxDistance || this.settings.alertDistance,
      title,
      lastAlertTime: 0,
    });

    console.log(`🎯 Started monitoring order ${orderId} (max distance: ${maxDistance || this.settings.alertDistance}m)`);
  }

  /**
   * Check current location against all monitored orders
   */
  checkLocation(currentLocation: { latitude: number; longitude: number }) {
    if (!this.settings.enabled || this.monitoredOrders.size === 0) {
      return;
    }

    const now = Date.now();

    this.monitoredOrders.forEach((order, orderId) => {
      const distance = this.calculateDistance(
        currentLocation.latitude,
        currentLocation.longitude,
        order.latitude,
        order.longitude
      );

      // Check if outside geofence
      if (distance > order.maxDistance) {
        // Check cooldown to prevent alert spam
        if (now - order.lastAlertTime > this.alertCooldown) {
          console.log(`⚠️ Geofence violation: Order ${orderId}, distance: ${Math.round(distance)}m`);
          this.triggerWarning(orderId, order.title, distance, order.maxDistance);
          order.lastAlertTime = now;
        }
      }
    });
  }

  /**
   * Calculate distance between two coordinates using Haversine formula
   */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371e3; // Earth radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  }

  /**
   * Trigger warning when outside geofence
   */
  private async triggerWarning(
    orderId: string,
    orderTitle: string,
    currentDistance: number,
    maxDistance: number
  ) {
    const distanceText = `${Math.round(currentDistance)}m`;
    const maxText = `${Math.round(maxDistance)}m`;

    // Send local notification
    if (this.settings.notificationEnabled) {
      await this.sendLocalNotification(
        '📍 Distance Alert',
        `"${orderTitle}" - You are ${distanceText} away (max: ${maxText})`
      );
    }

    // Show in-app alert with cancel option
    if (this.settings.autoPromptCancel) {
      Alert.alert(
        '⚠️ You are far from the order',
        `You are ${distanceText} away from "${orderTitle}"\nMaximum distance: ${maxText}\n\nDo you want to cancel this order?`,
        [
          {
            text: 'Keep Order',
            style: 'cancel',
          },
          {
            text: 'Cancel Order',
            style: 'destructive',
            onPress: () => {
              // This will be handled by OrderDetailScreen
              console.log(`User chose to cancel order ${orderId} due to distance`);
              // Could emit an event here if needed
            },
          },
        ]
      );
    }
  }

  /**
   * Send local notification
   */
  private async sendLocalNotification(title: string, body: string) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: true,
        },
        trigger: null, // Immediately
      });
    } catch (error) {
      console.error('❌ Failed to send notification:', error);
    }
  }

  /**
   * Stop monitoring a specific order
   */
  stopMonitoring(orderId: string) {
    if (this.monitoredOrders.has(orderId)) {
      this.monitoredOrders.delete(orderId);
      console.log(`🛑 Stopped monitoring order ${orderId}`);
    }
  }

  /**
   * Stop monitoring all orders
   */
  stopAllMonitoring() {
    this.monitoredOrders.clear();
    console.log('🛑 Stopped monitoring all orders');
  }

  /**
   * Get currently monitored orders
   */
  getMonitoredOrders(): string[] {
    return Array.from(this.monitoredOrders.keys());
  }

  /**
   * Update settings
   */
  updateSettings(settings: Partial<GeofenceSettings>) {
    this.settings = { ...this.settings, ...settings };
    console.log('⚙️ Geofence settings updated:', this.settings);
  }

  /**
   * Get current settings
   */
  getSettings(): GeofenceSettings {
    return { ...this.settings };
  }
}

// Export singleton instance
export default new GeofencingService();
