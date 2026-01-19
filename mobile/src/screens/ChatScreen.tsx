import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { GiftedChat, IMessage } from 'react-native-gifted-chat';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '../../config/api.config';
import api from '../services/api';

interface ChatScreenProps {
  route: {
    params: {
      orderId: string;
      orderTitle: string;
    };
  };
  navigation: any;
}

export default function ChatScreen({ route, navigation }: ChatScreenProps) {
  const { orderId, orderTitle } = route.params;
  const [messages, setMessages] = useState<IMessage[]>([]);
  const [userId, setUserId] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [loading, setLoading] = useState(true);

  // Set navigation title
  useEffect(() => {
    navigation.setOptions({
      title: `Chat: ${orderTitle}`,
    });
  }, [navigation, orderTitle]);

  // Initialize: Get user info and connect to chat
  useEffect(() => {
    let chatSocket: Socket | null = null;

    const initialize = async () => {
      try {
        // Get user info
        const userResponse = await api.get('/users/me');
        const currentUserId = userResponse.data.user.id;
        const currentUserName = userResponse.data.user.name;
        setUserId(currentUserId);
        setUserName(currentUserName);

        // Get JWT token for Socket.io authentication
        const token = await AsyncStorage.getItem('token');
        if (!token) {
          console.error('No token found');
          return;
        }

        // Connect to chat namespace
        chatSocket = io(`${API_BASE_URL}/chat`, {
          auth: { token },
          transports: ['websocket'],
        });

        chatSocket.on('connect', () => {
          console.log('✅ Connected to chat namespace');

          // Join the chat room
          chatSocket?.emit('join_chat', { orderId }, (response: any) => {
            if (response.error) {
              console.error('Failed to join chat:', response.error);
            } else {
              console.log('✅ Joined chat room successfully');
            }
          });
        });

        // Listen for new messages
        chatSocket.on('new_message', (data: any) => {
          console.log('📨 New message received:', data);

          const newMessage: IMessage = {
            _id: data.id,
            text: data.message,
            createdAt: new Date(data.createdAt),
            user: {
              _id: data.senderId,
              name: data.senderName || 'Unknown',
            },
          };

          setMessages((previousMessages) =>
            GiftedChat.append(previousMessages, [newMessage])
          );
        });

        chatSocket.on('connect_error', (error) => {
          console.error('Chat connection error:', error);
        });

        setSocket(chatSocket);

        // Load message history
        await loadMessageHistory(currentUserId);
      } catch (error) {
        console.error('Failed to initialize chat:', error);
      } finally {
        setLoading(false);
      }
    };

    initialize();

    // Cleanup on unmount
    return () => {
      if (chatSocket) {
        chatSocket.emit('leave_chat', { orderId });
        chatSocket.disconnect();
        console.log('👋 Disconnected from chat');
      }
    };
  }, [orderId]);

  // Load message history from API
  const loadMessageHistory = async (currentUserId: string) => {
    try {
      const response = await api.get(`/chat/${orderId}/messages`);
      const historyMessages = response.data.messages.map((msg: any) => ({
        _id: msg.id,
        text: msg.message,
        createdAt: new Date(msg.createdAt),
        user: {
          _id: msg.senderId,
          name: msg.senderName,
        },
      }));

      // GiftedChat expects messages in reverse chronological order
      setMessages(historyMessages.reverse());
      console.log(`📜 Loaded ${historyMessages.length} messages from history`);
    } catch (error) {
      console.error('Failed to load message history:', error);
    }
  };

  // Send message
  const onSend = useCallback(
    (newMessages: IMessage[] = []) => {
      const message = newMessages[0];
      if (!message || !socket) return;

      // Send message via Socket.io
      socket.emit(
        'send_message',
        { orderId, message: message.text },
        (response: any) => {
          if (response.error) {
            console.error('Failed to send message:', response.error);
          } else {
            console.log('✅ Message sent successfully');
          }
        }
      );
    },
    [socket, orderId]
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <GiftedChat
      messages={messages}
      onSend={(messages) => onSend(messages)}
      user={{
        _id: userId,
        name: userName,
      }}
      placeholder="Type a message..."
      alwaysShowSend
      showUserAvatar
      renderUsernameOnMessage
    />
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});
