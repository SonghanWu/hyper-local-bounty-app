import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import HomeScreen from './src/screens/HomeScreen';
import OrderDetailScreen from './src/screens/OrderDetailScreen';
import MyOrdersScreen from './src/screens/MyOrdersScreen';
import WalletScreen from './src/screens/WalletScreen';
import { RootStackParamList } from './src/navigation/types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}
