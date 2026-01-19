import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ChatService } from './chat.service';

interface JoinChatPayload {
  orderId: string;
}

interface SendMessagePayload {
  orderId: string;
  message: string;
}

interface TypingPayload {
  orderId: string;
  isTyping: boolean;
}

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
  namespace: '/chat', // Separate namespace for chat
  pingTimeout: 60000,
  pingInterval: 25000,
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private jwtService: JwtService,
    private chatService: ChatService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      // Extract JWT token from handshake
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.split(' ')[1];

      if (!token) {
        console.log('❌ Chat connection rejected: No token provided');
        client.disconnect();
        return;
      }

      // Verify JWT
      const payload = this.jwtService.verify(token);
      const userId = payload.sub;

      // Store userId in socket data
      client.data.userId = userId;

      console.log(`✅ User ${userId} connected to chat namespace`);
    } catch (error) {
      console.error('Chat WebSocket authentication failed:', error.message);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    if (userId) {
      console.log(`❌ User ${userId} disconnected from chat namespace`);
    }
  }

  /**
   * Join a chat room (one room per order)
   */
  @SubscribeMessage('join_chat')
  async handleJoinChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: JoinChatPayload,
  ) {
    const userId = client.data.userId;

    if (!userId) {
      return { error: 'Unauthorized' };
    }

    const { orderId } = data;

    try {
      // Verify user has access to this chat
      const hasAccess = await this.chatService.canAccessChat(orderId, userId);

      if (!hasAccess) {
        return {
          error: 'You do not have access to this chat',
        };
      }

      // Join the room
      client.join(orderId);
      console.log(`💬 User ${userId} joined chat room ${orderId}`);

      return {
        success: true,
        message: 'Joined chat successfully',
      };
    } catch (error) {
      console.error('Failed to join chat:', error);
      return { error: 'Failed to join chat' };
    }
  }

  /**
   * Leave a chat room
   */
  @SubscribeMessage('leave_chat')
  async handleLeaveChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: JoinChatPayload,
  ) {
    const userId = client.data.userId;

    if (!userId) {
      return { error: 'Unauthorized' };
    }

    const { orderId } = data;

    try {
      client.leave(orderId);
      console.log(`👋 User ${userId} left chat room ${orderId}`);

      return {
        success: true,
        message: 'Left chat successfully',
      };
    } catch (error) {
      console.error('Failed to leave chat:', error);
      return { error: 'Failed to leave chat' };
    }
  }

  /**
   * Send a message in a chat room
   */
  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: SendMessagePayload,
  ) {
    const userId = client.data.userId;

    if (!userId) {
      return { error: 'Unauthorized' };
    }

    const { orderId, message } = data;

    // Validate message
    if (!message || !message.trim()) {
      return { error: 'Message cannot be empty' };
    }

    try {
      // Save message to database
      const savedMessage = await this.chatService.saveMessage(
        orderId,
        userId,
        message.trim(),
      );

      // Broadcast message to all users in the room
      this.server.to(orderId).emit('new_message', {
        id: savedMessage.id,
        orderId: savedMessage.orderId,
        senderId: savedMessage.senderId,
        message: savedMessage.message,
        createdAt: savedMessage.createdAt,
      });

      console.log(`💬 Message sent in room ${orderId} by user ${userId}`);

      return {
        success: true,
        message: 'Message sent successfully',
        data: savedMessage,
      };
    } catch (error) {
      console.error('Failed to send message:', error);
      return { error: error.message || 'Failed to send message' };
    }
  }

  /**
   * Handle typing indicator
   */
  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: TypingPayload,
  ) {
    const userId = client.data.userId;

    if (!userId) {
      return { error: 'Unauthorized' };
    }

    const { orderId, isTyping } = data;

    try {
      // Broadcast typing status to other users in the room (exclude sender)
      client.to(orderId).emit('user_typing', {
        userId,
        isTyping,
      });

      return { success: true };
    } catch (error) {
      console.error('Failed to handle typing:', error);
      return { error: 'Failed to handle typing' };
    }
  }
}
