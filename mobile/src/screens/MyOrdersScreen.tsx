import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';
import { formatDateTime } from '../utils/dateFormatter';

type MyOrdersScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'MyOrders'
>;

interface Props {
  navigation: MyOrdersScreenNavigationProp;
}

interface Order {
  id: string;
  title: string;
  description: string;
  rewardAmount: number | string;
  status: string;
  latitude: number | string;
  longitude: number | string;
  createdAt: string;
  acceptedAt?: string;
  completedAt?: string;
  requester: {
    id: string;
    name: string;
  };
  helper?: {
    id: string;
    name: string;
  };
}

type TabType = 'posted' | 'helping';

export default function MyOrdersScreen({ navigation }: Props) {
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('posted');

  useEffect(() => {
    loadUserId();
    loadMyOrders();
  }, []);

  const loadUserId = async () => {
    try {
      const user = await AsyncStorage.getItem('user');
      if (user) {
        const userData = JSON.parse(user);
        setCurrentUserId(userData.id);
      }
    } catch (error) {
      console.error('Failed to load user ID:', error);
    }
  };

  const loadMyOrders = async () => {
    try {
      const response = await api.get('/orders/my-orders');
      if (response.data.success) {
        setMyOrders(response.data.orders);
      }
    } catch (error: any) {
      console.error('Failed to load orders:', error);
    }
    setIsLoading(false);
    setRefreshing(false);
  };

  const getFilteredOrders = () => {
    if (!currentUserId) return myOrders;

    if (activeTab === 'posted') {
      return myOrders.filter(order => order.requester?.id === currentUserId);
    } else {
      return myOrders.filter(order => order.helper?.id === currentUserId);
    }
  };

  const filteredOrders = getFilteredOrders();

  const onRefresh = () => {
    setRefreshing(true);
    loadMyOrders();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING':
        return '#FF9500';
      case 'ACCEPTED':
        return '#007AFF';
      case 'COMPLETED':
        return '#4CAF50';
      case 'CANCELLED':
        return '#9E9E9E';
      default:
        return '#666';
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading your orders...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.pageTitle}>My Orders</Text>

        {/* Tab Selector */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'posted' && styles.activeTab]}
            onPress={() => setActiveTab('posted')}
          >
            <Text style={[styles.tabText, activeTab === 'posted' && styles.activeTabText]}>
              📝 Posted ({currentUserId ? myOrders.filter(o => o.requester?.id === currentUserId).length : 0})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'helping' && styles.activeTab]}
            onPress={() => setActiveTab('helping')}
          >
            <Text style={[styles.tabText, activeTab === 'helping' && styles.activeTabText]}>
              🤝 Helping ({currentUserId ? myOrders.filter(o => o.helper?.id === currentUserId).length : 0})
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollView}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {filteredOrders.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {activeTab === 'posted' ? 'No posted orders yet' : 'No helping orders yet'}
              </Text>
              <Text style={styles.emptySubtext}>
                {activeTab === 'posted'
                  ? 'Post an order to see it here'
                  : 'Accept orders to help others'}
              </Text>
            </View>
          ) : (
            filteredOrders.map((order) => (
            <TouchableOpacity
              key={order.id}
              style={styles.orderCard}
              onPress={() => navigation.navigate('OrderDetail', { orderId: order.id })}
            >
              <View style={styles.orderHeader}>
                <Text style={styles.orderTitle}>{order.title}</Text>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: getStatusColor(order.status) },
                  ]}
                >
                  <Text style={styles.statusText}>{order.status}</Text>
                </View>
              </View>

              <Text style={styles.orderDescription} numberOfLines={2}>
                {order.description}
              </Text>

              <View style={styles.orderFooter}>
                <Text style={styles.rewardText}>${order.rewardAmount}</Text>
                <Text style={styles.dateText}>{formatDateTime(order.createdAt)}</Text>
              </View>

              <View style={styles.roleInfo}>
                {activeTab === 'posted' && order.helper && (
                  <Text style={styles.roleText}>
                    🤝 Helper: {order.helper.name}
                  </Text>
                )}
                {activeTab === 'helping' && order.requester && (
                  <Text style={styles.roleText}>
                    👤 Requester: {order.requester.name}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </View>
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
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 8,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: '#007AFF',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  activeTabText: {
    color: '#FFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
    marginHorizontal: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
  },
  orderCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  orderTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
    marginRight: 10,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  orderDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
    lineHeight: 20,
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  rewardText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  dateText: {
    fontSize: 12,
    color: '#999',
  },
  roleInfo: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  roleText: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
});
