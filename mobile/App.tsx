import React, { useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Notifications from 'expo-notifications';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import HomeScreen from './src/screens/HomeScreen';
import OrderDetailScreen from './src/screens/OrderDetailScreen';
import MyOrdersScreen from './src/screens/MyOrdersScreen';
import WalletScreen from './src/screens/WalletScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import { RootStackParamList } from './src/navigation/types';
import notificationService from './src/services/notification.service';
import AsyncStorage from '@react-native-async-storage/async-storage';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const navigationRef = useRef<any>(null);
  const notificationListener = useRef<any>();
  const responseListener = useRef<any>();

  useEffect(() => {
    // Register for push notifications after user logs in
    const initializeNotifications = async () => {
      const token = await AsyncStorage.getItem('token');
      if (token) {
        // User is logged in, register for push notifications
        await notificationService.registerForPushNotifications();
      }
    };

    initializeNotifications();

    // Listen for notifications received while app is in foreground
    notificationListener.current =
      notificationService.addNotificationReceivedListener((notification) => {
        console.log('Notification received:', notification);
      });

    // Listen for user tapping on notifications
    responseListener.current =
      notificationService.addNotificationResponseReceivedListener(
        (response) => {
          console.log('Notification tapped:', response);

          // Navigate to order detail if notification contains orderId
          const data = response.notification.request.content.data;
          if (data.orderId && navigationRef.current) {
            navigationRef.current.navigate('OrderDetail', {
              orderId: data.orderId,
            });
          }
        },
      );

    // Cleanup listeners on unmount
    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{
          headerStyle: {
            backgroundColor: '#007AFF',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      >
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Register"
          component={RegisterScreen}
          options={{
            title: 'Create Account',
            headerBackTitle: 'Back',
          }}
        />
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="OrderDetail"
          component={OrderDetailScreen}
          options={{
            title: 'Order Details',
          }}
        />
        <Stack.Screen
          name="MyOrders"
          component={MyOrdersScreen}
          options={{
            title: 'My Orders',
          }}
        />
        <Stack.Screen
          name="Wallet"
          component={WalletScreen}
          options={{
            title: 'My Wallet',
          }}
        />
        <Stack.Screen
          name="Profile"
          component={ProfileScreen}
          options={{
            title: 'Profile Settings',
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
