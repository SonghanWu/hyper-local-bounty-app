import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import websocketService, { NearbyUser } from '../services/websocket.service';
import locationService, { UserLocation } from '../services/location.service';
import geofencingService from '../services/geofencing.service';
import api from '../services/api';

type HomeScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Home'>;

interface Props {
  navigation: HomeScreenNavigationProp;
}

interface Order {
  id: string;
  title: string;
  description: string;
  rewardAmount: number;
  status: string;
  latitude: number;
  longitude: number;
  distance: number;
  createdAt: string;
}

export default function HomeScreen({ navigation }: Props) {
  const [isConnected, setIsConnected] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<UserLocation | null>(null);
  const [nearbyUsers, setNearbyUsers] = useState<NearbyUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [userName, setUserName] = useState('');
  const [searchRadius, setSearchRadius] = useState(1000); // Default 1km
  const [nearbyOrders, setNearbyOrders] = useState<Order[]>([]);
  const [orderSearchRadius, setOrderSearchRadius] = useState(1000); // Default 1km for orders

  // Post Order Modal state
  const [showPostOrderModal, setShowPostOrderModal] = useState(false);
  const [orderTitle, setOrderTitle] = useState('');
  const [orderDescription, setOrderDescription] = useState('');
  const [orderReward, setOrderReward] = useState('');

  useEffect(() => {
    initializeServices();
    loadUserInfo();

    return () => {
      // Cleanup on unmount
      locationService.stopTracking();
      websocketService.disconnect();
    };
  }, []);

  const loadUserInfo = async () => {
    try {
      const user = await AsyncStorage.getItem('user');
      if (user) {
        const userData = JSON.parse(user);
        setUserName(userData.name || 'User');
      }
    } catch (error) {
      console.error('Failed to load user info:', error);
    }
  };

  const initializeServices = async () => {
    setIsLoading(true);

    // Initialize geofencing notifications
    await geofencingService.initialize();

    // Connect WebSocket
    const connected = await websocketService.connect();
    setIsConnected(connected);

    if (!connected) {
      Alert.alert('Connection Error', 'Failed to connect to server');
      setIsLoading(false);
      return;
    }

    // Request location permissions
    const hasPermission = await locationService.requestPermissions();
    if (!hasPermission) {
      Alert.alert(
        'Location Permission Required',
        'This app needs location access to show nearby bounties and users.'
      );
      setIsLoading(false);
      return;
    }

    // Get current location
    const location = await locationService.getCurrentLocation();
    if (location) {
      setCurrentLocation(location);
    }

    setIsLoading(false);
  };

  const handleStartTracking = async () => {
    const success = await locationService.startTracking();
    if (success) {
      setIsTracking(true);
      Alert.alert('Location Tracking', 'Location tracking started successfully');
    } else {
      Alert.alert('Error', 'Failed to start location tracking');
    }
  };

  const handleStopTracking = () => {
    locationService.stopTracking();
    setIsTracking(false);
    Alert.alert('Location Tracking', 'Location tracking stopped');
  };

  const handleFindNearbyUsers = async () => {
    if (!currentLocation) {
      Alert.alert('Error', 'Current location not available');
      return;
    }

    setIsLoading(true);
    const response = await websocketService.getNearbyUsers(
      currentLocation.latitude,
      currentLocation.longitude,
      searchRadius
    );

    if (response.success) {
      setNearbyUsers(response.users);
      if (response.users.length === 0) {
        Alert.alert('No Nearby Users', `No users found within ${searchRadius >= 1000 ? searchRadius / 1000 + 'km' : searchRadius + 'm'}`);
      }
    } else {
      Alert.alert('Error', response.error || 'Failed to get nearby users');
    }
    setIsLoading(false);
  };

  const handleRefreshLocation = async () => {
    setIsLoading(true);
    const location = await locationService.getCurrentLocation();
    if (location) {
      setCurrentLocation(location);
      // Update location on server
      await websocketService.updateLocation(location.latitude, location.longitude);
      Alert.alert('Success', 'Location updated');
    } else {
      Alert.alert('Error', 'Failed to get current location');
    }
    setIsLoading(false);
  };

  const handleFindNearbyOrders = async () => {
    if (!currentLocation) {
      Alert.alert('Error', 'Current location not available');
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.get('/orders/nearby', {
        params: {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          radius: orderSearchRadius,
        },
      });

      if (response.data.success) {
        setNearbyOrders(response.data.orders);
        if (response.data.orders.length === 0) {
          Alert.alert(
            'No Nearby Orders',
            `No orders found within ${orderSearchRadius >= 1000 ? orderSearchRadius / 1000 + 'km' : orderSearchRadius + 'm'}`
          );
        }
      }
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to get nearby orders');
    }
    setIsLoading(false);
  };

  const handlePostOrder = async () => {
    if (!currentLocation) {
      Alert.alert('Error', 'Current location not available. Please enable location tracking first.');
      return;
    }

    if (!orderTitle.trim() || !orderDescription.trim() || !orderReward.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    const rewardAmount = parseFloat(orderReward);
    if (isNaN(rewardAmount) || rewardAmount <= 0) {
      Alert.alert('Error', 'Please enter a valid reward amount');
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.post('/orders', {
        title: orderTitle.trim(),
        description: orderDescription.trim(),
        rewardAmount,
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
      });

      if (response.data.success) {
        const createdOrder = response.data.order;

        // Start geofencing monitoring for requester
        geofencingService.startMonitoring(
          createdOrder.id,
          { latitude: createdOrder.latitude, longitude: createdOrder.longitude },
          createdOrder.title,
          500 // 500 meters alert distance
        );

        Alert.alert('Success', 'Order posted successfully!');
        setShowPostOrderModal(false);
        // Clear form
        setOrderTitle('');
        setOrderDescription('');
        setOrderReward('');
      }
    } catch (error: any) {
      console.error('Post order error:', error);
      Alert.alert('Error', error.response?.data?.message || error.message || 'Failed to post order');
    }
    setIsLoading(false);
  };

  const handleLogout = async () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          // Stop tracking
          locationService.stopTracking();

          // Send logout event to disable push notifications
          await websocketService.logout();

          // Disconnect WebSocket
          websocketService.disconnect();

          // Clear storage
          await AsyncStorage.removeItem('user');

          // Clear token from SecureStore (used by api.ts and websocket)
          const SecureStore = await import('expo-secure-store');
          await SecureStore.deleteItemAsync('token');

          // Navigate to Login
          navigation.reset({
            index: 0,
            routes: [{ name: 'Login' }],
          });
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Welcome, {userName}!</Text>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>

        {/* Connection Status */}
        <View style={styles.statusCard}>
          <Text style={styles.statusLabel}>WebSocket Status:</Text>
          <View style={styles.statusIndicator}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: isConnected ? '#4CAF50' : '#F44336' },
              ]}
            />
            <Text style={styles.statusText}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </Text>
          </View>
        </View>

        {/* Post Order Button */}
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.postOrderButton}
            onPress={() => {
              console.log('Post Order button clicked');
              setShowPostOrderModal(true);
            }}
            disabled={!isConnected || isLoading}
          >
            <Text style={styles.postOrderButtonText}>
              📝 Post a New Order {!isConnected && '(Disabled - Not Connected)'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.myOrdersButton}
            onPress={() => navigation.navigate('MyOrders')}
          >
            <Text style={styles.myOrdersButtonText}>📋 My Orders</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.walletButton}
            onPress={() => navigation.navigate('Wallet')}
          >
            <Text style={styles.walletButtonText}>💰 My Wallet</Text>
          </TouchableOpacity>
        </View>

        {/* Current Location */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Current Location</Text>
          {currentLocation ? (
            <View>
              <Text style={styles.locationText}>
                Latitude: {currentLocation.latitude.toFixed(6)}
              </Text>
              <Text style={styles.locationText}>
                Longitude: {currentLocation.longitude.toFixed(6)}
              </Text>
              <Text style={styles.locationText}>
                Accuracy: {currentLocation.accuracy?.toFixed(1) || 'N/A'}m
              </Text>
            </View>
          ) : (
            <Text style={styles.noDataText}>Location not available</Text>
          )}
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleRefreshLocation}
            disabled={isLoading}
          >
            <Text style={styles.secondaryButtonText}>
              {isLoading ? 'Refreshing...' : 'Refresh Location'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Location Tracking Controls */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Location Tracking</Text>
          <View style={styles.statusIndicator}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: isTracking ? '#4CAF50' : '#9E9E9E' },
              ]}
            />
            <Text style={styles.statusText}>
              {isTracking ? 'Tracking Active' : 'Tracking Inactive'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.button, isTracking && styles.stopButton]}
            onPress={isTracking ? handleStopTracking : handleStartTracking}
            disabled={!isConnected}
          >
            <Text style={styles.buttonText}>
              {isTracking ? 'Stop Tracking' : 'Start Tracking'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Nearby Users - Commented out for future use */}
        {/*
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Nearby Users</Text>
          <Text style={styles.sectionLabel}>Search Radius:</Text>
          <View style={styles.radiusButtons}>
            {[500, 1000, 2000, 5000, 10000].map((radius) => (
              <TouchableOpacity
                key={radius}
                style={[
                  styles.radiusButton,
                  searchRadius === radius && styles.radiusButtonActive,
                ]}
                onPress={() => setSearchRadius(radius)}
              >
                <Text
                  style={[
                    styles.radiusButtonText,
                    searchRadius === radius && styles.radiusButtonTextActive,
                  ]}
                >
                  {radius >= 1000 ? `${radius / 1000}km` : `${radius}m`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={styles.button}
            onPress={handleFindNearbyUsers}
            disabled={!isConnected || isLoading}
          >
            <Text style={styles.buttonText}>Find Nearby Users</Text>
          </TouchableOpacity>
          {isLoading && <ActivityIndicator size="small" color="#007AFF" style={styles.loader} />}
          {nearbyUsers.length > 0 && (
            <View style={styles.usersList}>
              <Text style={styles.usersCount}>Found {nearbyUsers.length} user(s)</Text>
              {nearbyUsers.map((user, index) => (
                <View key={user.member} style={styles.userItem}>
                  <Text style={styles.userNumber}>#{index + 1}</Text>
                  <View style={styles.userInfo}>
                    <Text style={styles.userDistance}>
                      {parseFloat(user.distance).toFixed(1)}m away
                    </Text>
                    <Text style={styles.userCoords}>
                      ({parseFloat(user.coordinates.latitude).toFixed(6)}, {parseFloat(user.coordinates.longitude).toFixed(6)})
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
        */}

        {/* Nearby Orders */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Nearby Orders</Text>
          <Text style={styles.sectionLabel}>Search Radius:</Text>
          <View style={styles.radiusButtons}>
            {[500, 1000, 2000, 5000, 10000].map((radius) => (
              <TouchableOpacity
                key={radius}
                style={[
                  styles.radiusButton,
                  orderSearchRadius === radius && styles.radiusButtonActive,
                ]}
                onPress={() => setOrderSearchRadius(radius)}
              >
                <Text
                  style={[
                    styles.radiusButtonText,
                    orderSearchRadius === radius && styles.radiusButtonTextActive,
                  ]}
                >
                  {radius >= 1000 ? `${radius / 1000}km` : `${radius}m`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={styles.button}
            onPress={handleFindNearbyOrders}
            disabled={!isConnected || isLoading}
          >
            <Text style={styles.buttonText}>Find Nearby Orders</Text>
          </TouchableOpacity>
          {isLoading && <ActivityIndicator size="small" color="#007AFF" style={styles.loader} />}
          {nearbyOrders.length > 0 && (
            <View style={styles.ordersList}>
              <Text style={styles.ordersCount}>Found {nearbyOrders.length} order(s)</Text>
              {nearbyOrders.map((order, index) => (
                <TouchableOpacity
                  key={order.id}
                  style={styles.orderItem}
                  onPress={() => navigation.navigate('OrderDetail', { orderId: order.id })}
                >
                  <View style={styles.orderHeader}>
                    <Text style={styles.orderNumber}>#{index + 1}</Text>
                    <Text style={styles.orderDistance}>
                      {order.distance.toFixed(0)}m away
                    </Text>
                  </View>
                  <Text style={styles.orderTitle}>{order.title}</Text>
                  <Text style={styles.orderDescription} numberOfLines={2}>
                    {order.description}
                  </Text>
                  <View style={styles.orderFooter}>
                    <Text style={styles.orderReward}>Reward: ${order.rewardAmount}</Text>
                    <Text style={styles.orderStatus}>{order.status}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Post Order Modal */}
      <Modal
        visible={showPostOrderModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPostOrderModal(false)}
        onShow={() => console.log('Post Order Modal opened')}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Post a New Order</Text>
              <TouchableOpacity onPress={() => setShowPostOrderModal(false)}>
                <Text style={styles.modalCloseButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm}>
              <Text style={styles.formLabel}>Title *</Text>
              <TextInput
                style={styles.formInput}
                placeholder="e.g., Need a phone charger"
                value={orderTitle}
                onChangeText={setOrderTitle}
                maxLength={100}
              />

              <Text style={styles.formLabel}>Description *</Text>
              <TextInput
                style={[styles.formInput, styles.formTextArea]}
                placeholder="Describe what you need help with..."
                value={orderDescription}
                onChangeText={setOrderDescription}
                multiline
                numberOfLines={4}
                maxLength={500}
              />

              <Text style={styles.formLabel}>Reward Amount ($) *</Text>
              <TextInput
                style={styles.formInput}
                placeholder="e.g., 5"
                value={orderReward}
                onChangeText={setOrderReward}
                keyboardType="decimal-pad"
              />

              {currentLocation && (
                <View style={styles.locationInfo}>
                  <Text style={styles.locationInfoText}>
                    📍 Order location: {currentLocation.latitude.toFixed(4)}, {currentLocation.longitude.toFixed(4)}
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={styles.submitButton}
                onPress={handlePostOrder}
                disabled={isLoading}
              >
                <Text style={styles.submitButtonText}>
                  {isLoading ? 'Posting...' : 'Post Order'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  container: {
    flex: 1,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  logoutButton: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F44336',
  },
  logoutText: {
    color: '#FFF',
    fontWeight: '600',
  },
  statusCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  locationText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  noDataText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
    marginTop: 10,
  },
  stopButton: {
    backgroundColor: '#F44336',
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  secondaryButtonText: {
    color: '#333',
    fontSize: 14,
    fontWeight: '600',
  },
  loader: {
    marginTop: 15,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    marginTop: 5,
  },
  radiusButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 15,
  },
  radiusButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  radiusButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  radiusButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  radiusButtonTextActive: {
    color: '#FFF',
  },
  ordersList: {
    marginTop: 15,
  },
  ordersCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 10,
  },
  orderItem: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  orderNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  orderDistance: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FF9500',
  },
  orderTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 6,
  },
  orderDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 10,
    lineHeight: 20,
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderReward: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  orderStatus: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
  },
  postOrderButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  postOrderButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  myOrdersButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  myOrdersButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  walletButton: {
    backgroundColor: '#FF9800',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  walletButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    height: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  modalCloseButton: {
    fontSize: 28,
    color: '#666',
    fontWeight: '300',
  },
  modalForm: {
    flexGrow: 1,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 12,
  },
  formInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#F9F9F9',
  },
  formTextArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  locationInfo: {
    backgroundColor: '#E3F2FD',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  locationInfoText: {
    fontSize: 13,
    color: '#1976D2',
  },
  submitButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  submitButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Commented out styles for Nearby Users (for future use)
  /*
  usersList: {
    marginTop: 15,
  },
  usersCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 10,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  userNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
    marginRight: 12,
    width: 30,
  },
  userInfo: {
    flex: 1,
  },
  userDistance: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  userCoords: {
    fontSize: 12,
    color: '#999',
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    marginTop: 5,
  },
  radiusButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 15,
  },
  radiusButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  radiusButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  radiusButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  radiusButtonTextActive: {
    color: '#FFF',
  },
  */
});
