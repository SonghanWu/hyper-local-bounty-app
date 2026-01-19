import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import api from './api';

/**
 * Configure how notifications are handled when the app is in the foreground
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true, // Deprecated but kept for backward compatibility
    shouldShowBanner: true, // New way: show notification banner
    shouldShowList: true,   // New way: add to notification list
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

class NotificationService {
  private expoPushToken: string | null = null;

  /**
   * Register for push notifications and save token to backend
   */
  async registerForPushNotifications(): Promise<string | null> {
    // Check if running on physical device
    if (!Device.isDevice) {
      console.log('Push notifications only work on physical devices');
      return null;
    }

    try {
      // Check existing permissions
      const { status: existingStatus } =
        await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      // Request permission if not already granted
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Push notification permission denied');
        return null;
      }

      // Get Expo push token
      // Note: For demo purposes, we skip push token registration if projectId is not configured
      // For production, get your project ID from: https://expo.dev/accounts/[account]/projects/[project]
      try {
        const tokenData = await Notifications.getExpoPushTokenAsync();
        this.expoPushToken = tokenData.data;
        console.log('Expo Push Token:', this.expoPushToken);
      } catch (error: any) {
        if (error.message?.includes('projectId')) {
          console.log(
            'Push notifications require projectId configuration. Skipping for demo.',
          );
          return null;
        }
        throw error;
      }

      // Save token to backend (only if we got a token)
      if (this.expoPushToken) {
        await this.savePushTokenToBackend(this.expoPushToken);
      }

      // Configure notification channels for Android
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      }

      return this.expoPushToken;
    } catch (error) {
      console.error('Error registering for push notifications:', error);
      return null;
    }
  }

  /**
   * Save push token to backend
   */
  private async savePushTokenToBackend(token: string): Promise<void> {
    try {
      const response = await api.post('/users/push-token', {
        expoPushToken: token,
      });

      if (response.data.success) {
        console.log('Push token saved to backend successfully');
      }
    } catch (error) {
      console.error('Failed to save push token to backend:', error);
    }
  }

  /**
   * Add listener for notifications received while app is in foreground
   */
  addNotificationReceivedListener(
    callback: (notification: Notifications.Notification) => void,
  ) {
    return Notifications.addNotificationReceivedListener(callback);
  }

  /**
   * Add listener for when user taps on a notification
   */
  addNotificationResponseReceivedListener(
    callback: (response: Notifications.NotificationResponse) => void,
  ) {
    return Notifications.addNotificationResponseReceivedListener(callback);
  }

  /**
   * Get the current push token
   */
  getToken(): string | null {
    return this.expoPushToken;
  }
}

export default new NotificationService();
