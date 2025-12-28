import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import websocketService, { NearbyUser } from '../services/websocket.service';
import locationService, { UserLocation } from '../services/location.service';

type HomeScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Home'>;

interface Props {
  navigation: HomeScreenNavigationProp;
}

export default function HomeScreen({ navigation }: Props) {
  const [isConnected, setIsConnected] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<UserLocation | null>(null);
  const [nearbyUsers, setNearbyUsers] = useState<NearbyUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [userName, setUserName] = useState('');
  const [searchRadius, setSearchRadius] = useState(1000); // Default 1km

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

        {/* Nearby Users */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Nearby Users</Text>

          {/* Distance Selector */}
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
      </ScrollView>
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
});
