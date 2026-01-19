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
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';
import websocketService from '../services/websocket.service';
import geofencingService from '../services/geofencing.service';
import { formatDateTime } from '../utils/dateFormatter';

type OrderDetailScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'OrderDetail'
>;
type OrderDetailScreenRouteProp = RouteProp<RootStackParamList, 'OrderDetail'>;

interface Props {
  navigation: OrderDetailScreenNavigationProp;
  route: OrderDetailScreenRouteProp;
}

interface OrderDetail {
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
    email: string;
  };
  helper?: {
    id: string;
    name: string;
    email: string;
  };
}

export default function OrderDetailScreen({ navigation, route }: Props) {
  const { orderId } = route.params;
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Edit Order Modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editReward, setEditReward] = useState('');

  const loadCurrentUser = async () => {
    try {
      const user = await AsyncStorage.getItem('user');
      if (user) {
        const userData = JSON.parse(user);
        setCurrentUserId(userData.id);
      }
    } catch (error) {
      console.error('Failed to load user:', error);
    }
  };

  const loadOrderDetail = async () => {
    setIsLoading(true);
    try {
      const response = await api.get(`/orders/${orderId}`);
      if (response.data.success) {
        const orderData = response.data.order;
        setOrder(orderData);

        // Start geofencing for requester if order is PENDING or ACCEPTED
        if (currentUserId && orderData.requester.id === currentUserId) {
          if (orderData.status === 'PENDING' || orderData.status === 'ACCEPTED') {
            geofencingService.startMonitoring(
              orderData.id,
              { latitude: orderData.latitude, longitude: orderData.longitude },
              orderData.title,
              500
            );
            console.log(`🎯 Started geofencing for requester on order ${orderData.id}`);
          }
        }

        // Start geofencing for helper if order is ACCEPTED
        if (currentUserId && orderData.helper?.id === currentUserId && orderData.status === 'ACCEPTED') {
          geofencingService.startMonitoring(
            orderData.id,
            { latitude: orderData.latitude, longitude: orderData.longitude },
            orderData.title,
            500
          );
          console.log(`🎯 Started geofencing for helper on order ${orderData.id}`);
        }
      }
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to load order');
      navigation.goBack();
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadOrderDetail();
    loadCurrentUser();

    // WebSocket listener for order status updates
    const handleOrderUpdate = (data: any) => {
      if (data.orderId === orderId) {
        // Reload order detail when status changes
        loadOrderDetail();
        Alert.alert('Order Updated', data.message);
      }
    };

    websocketService.on('order_accepted', handleOrderUpdate);

    return () => {
      websocketService.off('order_accepted', handleOrderUpdate);
    };
  }, [orderId]);

  const handleAcceptOrder = async () => {
    if (!order) return;

    Alert.alert('Accept Order', 'Are you sure you want to accept this order?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Accept',
        onPress: async () => {
          setIsProcessing(true);
          try {
            const response = await api.post(`/orders/${orderId}/accept`);
            if (response.data.success) {
              Alert.alert('Success', 'Order accepted successfully!');
              // Reload order detail (which will auto-start geofencing)
              await loadOrderDetail();
            }
          } catch (error: any) {
            Alert.alert(
              'Error',
              error.response?.data?.message || 'Failed to accept order'
            );
          }
          setIsProcessing(false);
        },
      },
    ]);
  };

  const handleCompleteOrder = async () => {
    if (!order) return;

    Alert.alert(
      'Complete Order',
      'Confirm that this order has been completed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete',
          onPress: async () => {
            setIsProcessing(true);
            try {
              const response = await api.post(`/orders/${orderId}/complete`);
              if (response.data.success) {
                // Stop geofencing monitoring
                geofencingService.stopMonitoring(orderId);

                Alert.alert('Success', 'Order marked as completed!');
                await loadOrderDetail();
              }
            } catch (error: any) {
              Alert.alert(
                'Error',
                error.response?.data?.message || 'Failed to complete order'
              );
            }
            setIsProcessing(false);
          },
        },
      ]
    );
  };

  const handleCancelOrder = async () => {
    if (!order) return;

    Alert.alert('Cancel Order', 'Are you sure you want to cancel this order?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Cancel',
        style: 'destructive',
        onPress: async () => {
          setIsProcessing(true);
          try {
            const response = await api.post(`/orders/${orderId}/cancel`);
            if (response.data.success) {
              // Stop geofencing monitoring
              geofencingService.stopMonitoring(orderId);

              Alert.alert('Cancelled', 'Order has been cancelled');
              await loadOrderDetail();
            }
          } catch (error: any) {
            Alert.alert(
              'Error',
              error.response?.data?.message || 'Failed to cancel order'
            );
          }
          setIsProcessing(false);
        },
      },
    ]);
  };

  const openEditModal = () => {
    if (!order) return;
    setEditTitle(order.title);
    setEditDescription(order.description);
    setEditReward(order.rewardAmount.toString());
    setShowEditModal(true);
  };

  const handleEditOrder = async () => {
    if (!editTitle.trim() || !editReward.trim()) {
      Alert.alert('Error', 'Please fill in title and reward amount');
      return;
    }

    const rewardAmount = parseFloat(editReward);
    if (isNaN(rewardAmount) || rewardAmount <= 0) {
      Alert.alert('Error', 'Please enter a valid reward amount');
      return;
    }

    setIsProcessing(true);
    try {
      const response = await api.put(`/orders/${orderId}`, {
        title: editTitle.trim(),
        description: editDescription.trim() || '', // Description is optional
        rewardAmount,
      });

      if (response.data.success) {
        Alert.alert('Success', 'Order updated successfully!');
        setShowEditModal(false);
        await loadOrderDetail();
      }
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to update order');
    }
    setIsProcessing(false);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading order...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Order not found</Text>
          <TouchableOpacity style={styles.button} onPress={() => navigation.goBack()}>
            <Text style={styles.buttonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Role-based permissions
  const isRequester = order.requester.id === currentUserId;
  const isHelper = order.helper?.id === currentUserId;
  const canAccept = !isRequester && order.status === 'PENDING';
  const canComplete = isRequester && order.status === 'ACCEPTED';
  const canCancel =
    (isRequester || isHelper) &&
    order.status !== 'COMPLETED' &&
    order.status !== 'CANCELLED';
  const canEdit = isRequester && (order.status === 'PENDING' || order.status === 'CANCELLED');

  // Convert latitude/longitude to numbers (PostgreSQL decimal returns as string)
  const latitude = typeof order.latitude === 'string' ? parseFloat(order.latitude) : order.latitude;
  const longitude = typeof order.longitude === 'string' ? parseFloat(order.longitude) : order.longitude;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container}>
        {/* Status Badge */}
        <View style={styles.statusBadgeContainer}>
          <View
            style={[
              styles.statusBadge,
              order.status === 'PENDING' && styles.statusPending,
              order.status === 'ACCEPTED' && styles.statusAccepted,
              order.status === 'COMPLETED' && styles.statusCompleted,
              order.status === 'CANCELLED' && styles.statusCancelled,
            ]}
          >
            <Text style={styles.statusBadgeText}>{order.status}</Text>
          </View>
        </View>

        {/* Order Title */}
        <Text style={styles.title}>{order.title}</Text>

        {/* Reward */}
        <View style={styles.rewardContainer}>
          <Text style={styles.rewardLabel}>Reward:</Text>
          <Text style={styles.rewardAmount}>${order.rewardAmount}</Text>
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.description}>{order.description}</Text>
        </View>

        {/* Location */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location</Text>
          <Text style={styles.locationText}>
            Latitude: {latitude.toFixed(6)}
          </Text>
          <Text style={styles.locationText}>
            Longitude: {longitude.toFixed(6)}
          </Text>
        </View>

        {/* Requester Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Requested By</Text>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{order.requester.name}</Text>
          </View>
        </View>

        {/* Helper Info */}
        {order.helper && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Accepted By</Text>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{order.helper.name}</Text>
            </View>
          </View>
        )}

        {/* Timestamps */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Timeline</Text>
          <Text style={styles.timestamp}>
            Created: {formatDateTime(order.createdAt)}
          </Text>
          {order.acceptedAt && (
            <Text style={styles.timestamp}>
              Accepted: {formatDateTime(order.acceptedAt)}
            </Text>
          )}
          {order.completedAt && (
            <Text style={styles.timestamp}>
              Completed: {formatDateTime(order.completedAt)}
            </Text>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          {canAccept && (
            <TouchableOpacity
              style={[styles.button, styles.acceptButton]}
              onPress={handleAcceptOrder}
              disabled={isProcessing}
            >
              <Text style={styles.buttonText}>
                {isProcessing ? 'Processing...' : 'Accept Order'}
              </Text>
            </TouchableOpacity>
          )}

          {canComplete && (
            <TouchableOpacity
              style={[styles.button, styles.completeButton]}
              onPress={handleCompleteOrder}
              disabled={isProcessing}
            >
              <Text style={styles.buttonText}>
                {isProcessing ? 'Processing...' : 'Mark as Completed'}
              </Text>
            </TouchableOpacity>
          )}

          {canCancel && (
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={handleCancelOrder}
              disabled={isProcessing}
            >
              <Text style={styles.buttonText}>
                {isProcessing ? 'Processing...' : 'Cancel Order'}
              </Text>
            </TouchableOpacity>
          )}

          {canEdit && (
            <TouchableOpacity
              style={[styles.button, styles.editButton]}
              onPress={openEditModal}
              disabled={isProcessing}
            >
              <Text style={styles.buttonText}>
                {order.status === 'CANCELLED' ? 'Reactivate & Edit Order' : 'Edit Order'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Edit Order Modal */}
      <Modal
        visible={showEditModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Order</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Text style={styles.modalCloseButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm}>
              <Text style={styles.formLabel}>Title *</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Order title"
                value={editTitle}
                onChangeText={setEditTitle}
                maxLength={100}
              />

              <Text style={styles.formLabel}>Description (Optional)</Text>
              <TextInput
                style={[styles.formInput, styles.formTextArea]}
                placeholder="Order description (optional)"
                value={editDescription}
                onChangeText={setEditDescription}
                multiline
                numberOfLines={4}
                maxLength={500}
              />

              <Text style={styles.formLabel}>Reward Amount ($) *</Text>
              <TextInput
                style={styles.formInput}
                placeholder="e.g., 5"
                value={editReward}
                onChangeText={setEditReward}
                keyboardType="decimal-pad"
              />

              {order.status === 'CANCELLED' && (
                <View style={styles.reactivateInfo}>
                  <Text style={styles.reactivateInfoText}>
                    ℹ️ Editing this cancelled order will reactivate it to PENDING status
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleEditOrder}
                disabled={isProcessing}
              >
                <Text style={styles.submitButtonText}>
                  {isProcessing ? 'Saving...' : 'Save Changes'}
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#F44336',
    marginBottom: 20,
  },
  statusBadgeContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  statusBadge: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  statusPending: {
    backgroundColor: '#FF9500',
  },
  statusAccepted: {
    backgroundColor: '#007AFF',
  },
  statusCompleted: {
    backgroundColor: '#4CAF50',
  },
  statusCancelled: {
    backgroundColor: '#9E9E9E',
  },
  statusBadgeText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
    textAlign: 'center',
  },
  rewardContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 25,
  },
  rewardLabel: {
    fontSize: 18,
    color: '#666',
    marginRight: 10,
  },
  rewardAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  section: {
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  description: {
    fontSize: 15,
    color: '#666',
    lineHeight: 22,
  },
  locationText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  userInfo: {
    backgroundColor: '#F5F5F5',
    padding: 12,
    borderRadius: 8,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: '#666',
  },
  timestamp: {
    fontSize: 14,
    color: '#666',
    marginBottom: 6,
  },
  actionsContainer: {
    marginTop: 10,
    marginBottom: 30,
  },
  button: {
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
    marginBottom: 10,
  },
  acceptButton: {
    backgroundColor: '#007AFF',
  },
  completeButton: {
    backgroundColor: '#4CAF50',
  },
  cancelButton: {
    backgroundColor: '#F44336',
  },
  editButton: {
    backgroundColor: '#FF9500',
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
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
  reactivateInfo: {
    backgroundColor: '#FFF3CD',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#FF9500',
  },
  reactivateInfoText: {
    fontSize: 13,
    color: '#856404',
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
});
