import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import MapView, { Marker, Callout, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import locationService, { UserLocation } from '../services/location.service';
import api from '../services/api';

type MapScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Map'>;

interface Props {
  navigation: MapScreenNavigationProp;
}

interface NearbyOrder {
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

// On Android react-native-maps requires the Google Maps provider (and an API
// key configured in app.json). On iOS we fall back to Apple Maps, which needs
// no key — keeps the map working out of the box for iOS dev builds.
const MAP_PROVIDER = Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined;

// Fallback region (Ann Arbor) used only until the device location resolves.
const FALLBACK_REGION = {
  latitude: 42.2776,
  longitude: -83.7382,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

const RADIUS_OPTIONS = [500, 1000, 2000, 5000, 10000];
const REFRESH_INTERVAL_MS = 10000;

function formatRadius(radius: number): string {
  return radius >= 1000 ? `${radius / 1000}km` : `${radius}m`;
}

function markerColor(status: string): string {
  switch (status) {
    case 'PENDING':
      return '#F44336'; // red — available to accept
    case 'ACCEPTED':
      return '#FF9500'; // orange — already taken
    default:
      return '#9E9E9E';
  }
}

export default function MapScreen({ navigation }: Props) {
  const mapRef = useRef<MapView | null>(null);
  const [currentLocation, setCurrentLocation] = useState<UserLocation | null>(null);
  const [nearbyOrders, setNearbyOrders] = useState<NearbyOrder[]>([]);
  const [searchRadius, setSearchRadius] = useState(2000); // Default 2km
  const [isLoadingLocation, setIsLoadingLocation] = useState(true);
  const [isFetchingOrders, setIsFetchingOrders] = useState(false);

  // Keep the latest location/radius in refs so the polling interval always
  // reads fresh values without being recreated on every change.
  const locationRef = useRef<UserLocation | null>(null);
  const radiusRef = useRef(searchRadius);
  locationRef.current = currentLocation;
  radiusRef.current = searchRadius;

  const fetchNearbyOrders = useCallback(async () => {
    const location = locationRef.current;
    if (!location) return;

    setIsFetchingOrders(true);
    try {
      const response = await api.get('/orders/nearby', {
        params: {
          latitude: location.latitude,
          longitude: location.longitude,
          radius: radiusRef.current,
        },
      });
      if (response.data?.success) {
        setNearbyOrders(response.data.orders ?? []);
      }
    } catch (error: any) {
      // Stay quiet on background polling errors; only the initial manual
      // attempts surface to the user via the empty state.
      console.error('Failed to fetch nearby orders for map:', error?.message);
    } finally {
      setIsFetchingOrders(false);
    }
  }, []);

  // Resolve the current location once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const hasPermission = await locationService.requestPermissions();
      if (!hasPermission) {
        if (!cancelled) setIsLoadingLocation(false);
        Alert.alert(
          'Location Permission Required',
          'Enable location access to see nearby bounties on the map.',
        );
        return;
      }
      const location = await locationService.getCurrentLocation();
      if (cancelled) return;
      if (location) {
        setCurrentLocation(location);
        locationRef.current = location;
        fetchNearbyOrders();
      }
      setIsLoadingLocation(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchNearbyOrders]);

  // Poll for nearby orders while the screen is focused.
  useFocusEffect(
    useCallback(() => {
      fetchNearbyOrders();
      const interval = setInterval(fetchNearbyOrders, REFRESH_INTERVAL_MS);
      return () => clearInterval(interval);
    }, [fetchNearbyOrders]),
  );

  const recenter = useCallback(() => {
    const location = locationRef.current;
    if (location && mapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        },
        400,
      );
    }
  }, []);

  if (isLoadingLocation) {
    return (
      <SafeAreaView style={styles.centered} edges={['bottom']}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Getting your location…</Text>
      </SafeAreaView>
    );
  }

  const initialRegion = currentLocation
    ? {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }
    : FALLBACK_REGION;

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={MAP_PROVIDER}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass
      >
        {nearbyOrders.map((order) => (
          <Marker
            key={order.id}
            coordinate={{ latitude: order.latitude, longitude: order.longitude }}
            pinColor={markerColor(order.status)}
            onCalloutPress={() =>
              navigation.navigate('OrderDetail', { orderId: order.id })
            }
          >
            <Callout tooltip={false}>
              <View style={styles.callout}>
                <Text style={styles.calloutTitle} numberOfLines={1}>
                  {order.title}
                </Text>
                <Text style={styles.calloutReward}>${order.rewardAmount}</Text>
                <Text style={styles.calloutMeta}>
                  {order.distance.toFixed(0)}m away · {order.status}
                </Text>
                <Text style={styles.calloutLink}>Tap for details ›</Text>
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>

      {/* Top overlay: result count + radius selector */}
      <SafeAreaView style={styles.topOverlay} edges={['top']} pointerEvents="box-none">
        <View style={styles.countPill}>
          <Text style={styles.countText}>
            {nearbyOrders.length} order{nearbyOrders.length === 1 ? '' : 's'} within{' '}
            {formatRadius(searchRadius)}
          </Text>
          {isFetchingOrders && (
            <ActivityIndicator size="small" color="#007AFF" style={styles.countSpinner} />
          )}
        </View>

        <View style={styles.radiusBar}>
          {RADIUS_OPTIONS.map((radius) => {
            const active = searchRadius === radius;
            return (
              <TouchableOpacity
                key={radius}
                style={[styles.radiusChip, active && styles.radiusChipActive]}
                onPress={() => {
                  setSearchRadius(radius);
                  radiusRef.current = radius;
                  fetchNearbyOrders();
                }}
              >
                <Text style={[styles.radiusChipText, active && styles.radiusChipTextActive]}>
                  {formatRadius(radius)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </SafeAreaView>

      {/* Recenter button */}
      <TouchableOpacity style={styles.recenterButton} onPress={recenter}>
        <Text style={styles.recenterIcon}>◎</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: '#666',
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
  },
  countPill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  countText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  countSpinner: {
    marginLeft: 8,
  },
  radiusBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
  },
  radiusChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  radiusChipActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  radiusChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
  },
  radiusChipTextActive: {
    color: '#FFF',
  },
  recenterButton: {
    position: 'absolute',
    right: 16,
    bottom: 32,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  recenterIcon: {
    fontSize: 26,
    color: '#007AFF',
  },
  callout: {
    width: 180,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  calloutTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 2,
  },
  calloutReward: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 2,
  },
  calloutMeta: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  calloutLink: {
    fontSize: 12,
    fontWeight: '600',
    color: '#007AFF',
  },
});
