import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMessage } from './chat-message.entity';
import { Order } from '../orders/order.entity';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatMessage)
    private chatMessagesRepository: Repository<ChatMessage>,
    @InjectRepository(Order)
    private ordersRepository: Repository<Order>,
  ) {}

  /**
   * Save a chat message to the database
   */
  async saveMessage(
    orderId: string,
    senderId: string,
    message: string,
  ): Promise<ChatMessage> {
    // Verify order exists
    const order = await this.ordersRepository.findOne({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    // Verify sender is either the requester or helper
    if (senderId !== order.requesterId && senderId !== order.helperId) {
      throw new ForbiddenException(
        'You can only send messages in orders you are involved in',
      );
    }

    const chatMessage = this.chatMessagesRepository.create({
      orderId,
      senderId,
      message,
    });

    return await this.chatMessagesRepository.save(chatMessage);
  }

  /**
   * Get message history for an order
   */
  async getMessages(orderId: string, userId: string): Promise<ChatMessage[]> {
    // Verify order exists and user has access
    const order = await this.ordersRepository.findOne({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    // Verify user is either the requester or helper
    if (userId !== order.requesterId && userId !== order.helperId) {
      throw new ForbiddenException(
        'You can only view messages in orders you are involved in',
      );
    }

    // Fetch messages ordered by creation time
    return await this.chatMessagesRepository.find({
      where: { orderId },
      relations: ['sender'],
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Check if user has access to chat in this order
   */
  async canAccessChat(orderId: string, userId: string): Promise<boolean> {
    const order = await this.ordersRepository.findOne({
      where: { id: orderId },
    });

    if (!order) {
      return false;
    }

    return userId === order.requesterId || userId === order.helperId;
  }
}
