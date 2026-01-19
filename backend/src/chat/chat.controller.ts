import {
  Controller,
  Get,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /**
   * Get message history for an order
   * GET /chat/:orderId/messages
   */
  @Get(':orderId/messages')
  async getMessages(@Param('orderId') orderId: string, @Request() req) {
    const userId = req.user.id;
    const messages = await this.chatService.getMessages(orderId, userId);

    return {
      success: true,
      messages: messages.map((msg) => ({
        id: msg.id,
        orderId: msg.orderId,
        senderId: msg.senderId,
        senderName: msg.sender.name,
        message: msg.message,
        createdAt: msg.createdAt,
      })),
    };
  }
}
