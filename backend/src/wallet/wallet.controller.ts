import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  /**
   * Get current user's balance
   * GET /wallet/balance
   */
  @Get('balance')
  async getBalance(@Request() req) {
    const userId = req.user.id;
    const balance = await this.walletService.getBalance(userId);
    return {
      success: true,
      balance,
    };
  }

  /**
   * Get current user's transaction history
   * GET /wallet/transactions?limit=50
   */
  @Get('transactions')
  async getTransactions(@Request() req, @Query('limit') limit?: string) {
    const userId = req.user.id;
    const parsedLimit = limit ? parseInt(limit, 10) : 50;

    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      throw new BadRequestException('Limit must be between 1 and 100');
    }

    const transactions = await this.walletService.getTransactions(
      userId,
      parsedLimit,
    );

    return {
      success: true,
      transactions,
    };
  }

  /**
   * Manual transfer between users (admin/testing only)
   * POST /wallet/transfer
   *
   * Note: In production, transfers should only happen through order completion.
   * This endpoint is for testing purposes.
   */
  @Post('transfer')
  async transfer(
    @Request() req,
    @Body()
    body: {
      toUserId: string;
      amount: number;
      platformFeePercentage?: number;
    },
  ) {
    const fromUserId = req.user.id;
    const { toUserId, amount, platformFeePercentage = 10 } = body;

    if (!toUserId || !amount) {
      throw new BadRequestException('toUserId and amount are required');
    }

    if (fromUserId === toUserId) {
      throw new BadRequestException('Cannot transfer to yourself');
    }

    const result = await this.walletService.transfer(
      fromUserId,
      toUserId,
      amount,
      null, // No order ID for manual transfers
      platformFeePercentage,
    );

    return {
      success: true,
      ...result,
    };
  }
}
