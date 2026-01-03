import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';
import { formatRelativeTime } from '../utils/dateFormatter';

type WalletScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface Transaction {
  id: string;
  fromUserId: string | null;
  toUserId: string | null;
  amount: number;
  type: 'TRANSFER' | 'PLATFORM_FEE' | 'REFUND' | 'TOP_UP' | 'WITHDRAWAL';
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  description: string;
  createdAt: string;
  orderId?: string;
  fromUser?: { name: string };
  toUser?: { name: string };
}

export default function WalletScreen() {
  const navigation = useNavigation<WalletScreenNavigationProp>();
  const [balance, setBalance] = useState<number>(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    loadCurrentUser();
    loadWalletData();
  }, []);

  const loadCurrentUser = async () => {
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

  const loadWalletData = async () => {
    try {
      setIsLoading(true);

      // Fetch balance and transactions in parallel
      const [balanceResponse, transactionsResponse] = await Promise.all([
        api.get('/wallet/balance'),
        api.get('/wallet/transactions?limit=50'),
      ]);

      if (balanceResponse.data.success) {
        setBalance(balanceResponse.data.balance);
      }

      if (transactionsResponse.data.success) {
        // Filter out any invalid transactions and platform fees (internal records)
        const validTransactions = (transactionsResponse.data.transactions || []).filter(
          (t: any) => t && t.id && t.type !== 'PLATFORM_FEE'
        );
        setTransactions(validTransactions);
      }
    } catch (error: any) {
      console.error('Failed to load wallet data:', error);
      Alert.alert(
        'Error',
        error.response?.data?.message || 'Failed to load wallet data',
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadWalletData();
  };

  const getTransactionIcon = (type: Transaction['type']) => {
    switch (type) {
      case 'TRANSFER':
        return '💸';
      case 'PLATFORM_FEE':
        return '🏦';
      case 'REFUND':
        return '↩️';
      case 'TOP_UP':
        return '💰';
      case 'WITHDRAWAL':
        return '🏧';
      default:
        return '💵';
    }
  };

  const getTransactionColor = (type: Transaction['type']) => {
    switch (type) {
      case 'TRANSFER':
        return '#4CAF50';
      case 'PLATFORM_FEE':
        return '#FF9800';
      case 'REFUND':
        return '#2196F3';
      case 'TOP_UP':
        return '#4CAF50';
      case 'WITHDRAWAL':
        return '#F44336';
      default:
        return '#757575';
    }
  };

  /**
   * Get display amount for transaction
   * For sender: show total amount (including fee)
   * For receiver: show net amount (after fee)
   */
  const getDisplayAmount = (transaction: Transaction): number => {
    const netAmount = parseFloat(transaction.amount.toString());

    // If current user is the sender
    if (transaction.fromUserId === currentUserId) {
      // Try to extract total amount from description
      // Format: "Transfer: $10.00 (Platform fee: $1.00, Net: $9.00)"
      const match = transaction.description?.match(/Transfer: \$(\d+\.?\d*)/);
      if (match && match[1]) {
        return parseFloat(match[1]);
      }
      // Fallback to net amount if description doesn't have total
      return netAmount;
    }

    // If current user is the receiver, show net amount
    return netAmount;
  };

  if (isLoading && !isRefreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" style={styles.loader} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Your Balance</Text>
          <Text style={styles.balanceAmount}>${balance.toFixed(2)}</Text>
          <Text style={styles.balanceSubtext}>Virtual Currency</Text>
        </View>

        {/* Transaction History */}
        <View style={styles.historySection}>
          <Text style={styles.sectionTitle}>Transaction History</Text>

          {transactions.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No transactions yet</Text>
              <Text style={styles.emptySubtext}>
                Complete orders to start earning!
              </Text>
            </View>
          ) : (
            transactions
              .filter((transaction) => transaction && transaction.id)
              .map((transaction) => {
                const hasOrder = transaction.orderId;
                const CardComponent = hasOrder ? TouchableOpacity : View;

                return (
                  <CardComponent
                    key={transaction.id}
                    style={styles.transactionCard}
                    onPress={
                      hasOrder
                        ? () => navigation.navigate('OrderDetail', { orderId: transaction.orderId! })
                        : undefined
                    }
                  >
                    <View style={styles.transactionHeader}>
                    <View style={styles.transactionIconContainer}>
                      <Text style={styles.transactionIcon}>
                        {getTransactionIcon(transaction.type)}
                      </Text>
                    </View>
                    <View style={styles.transactionInfo}>
                      <Text style={styles.transactionDescription}>
                        {transaction.description || transaction.type}
                      </Text>
                      <Text style={styles.transactionDate}>
                        {transaction.createdAt ? formatRelativeTime(transaction.createdAt) : 'Unknown'}
                      </Text>
                    </View>
                    <View style={styles.transactionAmountContainer}>
                      <Text
                        style={[
                          styles.transactionAmount,
                          {
                            color:
                              transaction.toUserId === currentUserId
                                ? '#4CAF50' // Green for incoming
                                : '#F44336', // Red for outgoing
                          },
                        ]}
                      >
                        {transaction.toUserId === currentUserId ? '+' : '-'}$
                        {getDisplayAmount(transaction).toFixed(2)}
                      </Text>
                      <Text
                        style={[
                          styles.transactionStatus,
                          transaction.status === 'COMPLETED' && styles.statusCompleted,
                          transaction.status === 'PENDING' && styles.statusPending,
                          transaction.status === 'FAILED' && styles.statusFailed,
                        ]}
                      >
                        {transaction.status || 'UNKNOWN'}
                      </Text>
                    </View>
                  </View>
                  {hasOrder && (
                    <Text style={styles.viewOrderText}>View Order →</Text>
                  )}
                </CardComponent>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loader: {
    marginTop: 50,
  },
  balanceCard: {
    backgroundColor: '#007AFF',
    margin: 16,
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  balanceLabel: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.8,
    marginBottom: 8,
  },
  balanceAmount: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  balanceSubtext: {
    fontSize: 12,
    color: '#FFFFFF',
    opacity: 0.7,
  },
  historySection: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
    color: '#000',
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#757575',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9E9E9E',
  },
  transactionCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  transactionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  transactionIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  transactionIcon: {
    fontSize: 20,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionDescription: {
    fontSize: 14,
    fontWeight: '500',
    color: '#000',
    marginBottom: 4,
  },
  transactionDate: {
    fontSize: 12,
    color: '#757575',
  },
  transactionAmountContainer: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  transactionStatus: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  statusCompleted: {
    backgroundColor: '#E8F5E9',
    color: '#4CAF50',
  },
  statusPending: {
    backgroundColor: '#FFF3E0',
    color: '#FF9800',
  },
  statusFailed: {
    backgroundColor: '#FFEBEE',
    color: '#F44336',
  },
  viewOrderText: {
    marginTop: 8,
    fontSize: 12,
    color: '#007AFF',
    textAlign: 'center',
  },
});
