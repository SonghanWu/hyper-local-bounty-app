import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { User } from '../users/user.entity';
import { Transaction, TransactionType, TransactionStatus } from './transaction.entity';

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Get user's current balance
   */
  async getBalance(userId: string): Promise<number> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return parseFloat(user.balance.toString());
  }

  /**
   * Get user's transaction history
   */
  async getTransactions(
    userId: string,
    limit: number = 50,
  ): Promise<Transaction[]> {
    return this.transactionRepository.find({
      where: [{ fromUserId: userId }, { toUserId: userId }],
      relations: ['fromUser', 'toUser', 'order'],
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Transfer money between users (with optional platform fee)
   * This is used when an order is completed
   *
   * @param fromUserId - Sender (requester)
   * @param toUserId - Receiver (helper)
   * @param amount - Total amount to transfer
   * @param orderId - Related order ID
   * @param platformFeePercentage - Platform fee (0-100, default 10%)
   */
  async transfer(
    fromUserId: string,
    toUserId: string,
    amount: number,
    orderId?: string,
    platformFeePercentage: number = 10,
  ): Promise<{ success: boolean; transactionId: string; netAmount: number }> {
    // Validate inputs
    if (amount <= 0) {
      throw new BadRequestException('Transfer amount must be positive');
    }

    if (platformFeePercentage < 0 || platformFeePercentage > 100) {
      throw new BadRequestException('Platform fee must be between 0 and 100');
    }

    // Calculate platform fee and net amount
    const platformFee = (amount * platformFeePercentage) / 100;
    const netAmount = amount - platformFee;

    // Use database transaction to ensure atomicity
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Lock and validate sender
      const sender = await queryRunner.manager.findOne(User, {
        where: { id: fromUserId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!sender) {
        throw new NotFoundException('Sender not found');
      }

      const senderBalance = parseFloat(sender.balance.toString());
      if (senderBalance < amount) {
        throw new BadRequestException(
          `Insufficient balance. Required: ${amount}, Available: ${senderBalance}`,
        );
      }

      // 2. Lock and validate receiver
      const receiver = await queryRunner.manager.findOne(User, {
        where: { id: toUserId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!receiver) {
        throw new NotFoundException('Receiver not found');
      }

      // 3. Create main transaction record (PENDING)
      const transaction = queryRunner.manager.create(Transaction, {
        fromUserId: fromUserId,
        toUserId: toUserId,
        amount: netAmount,
        type: TransactionType.TRANSFER,
        status: TransactionStatus.PENDING,
        orderId,
        description: `Transfer from ${sender.name} to ${receiver.name}`,
      });
      await queryRunner.manager.save(Transaction, transaction);

      // 4. Update balances
      const newSenderBalance = senderBalance - amount;
      const newReceiverBalance = parseFloat(receiver.balance.toString()) + netAmount;

      sender.balance = newSenderBalance as any;
      receiver.balance = newReceiverBalance as any;

      await queryRunner.manager.save(User, sender);
      await queryRunner.manager.save(User, receiver);

      // 5. Create platform fee transaction if applicable
      if (platformFee > 0) {
        const feeTransaction = queryRunner.manager.create(Transaction, {
          fromUserId: fromUserId,
          toUserId: null, // Platform receives the fee
          amount: platformFee,
          type: TransactionType.PLATFORM_FEE,
          status: TransactionStatus.COMPLETED,
          orderId,
          description: `Platform fee (${platformFeePercentage}%) from order`,
        });
        await queryRunner.manager.save(Transaction, feeTransaction);
      }

      // 6. Mark main transaction as completed
      transaction.status = TransactionStatus.COMPLETED;
      await queryRunner.manager.save(Transaction, transaction);

      // Commit transaction
      await queryRunner.commitTransaction();

      console.log(
        `✅ Transfer completed: ${sender.name} -> ${receiver.name}, Amount: ${amount} (Net: ${netAmount}, Fee: ${platformFee})`,
      );

      return {
        success: true,
        transactionId: transaction.id,
        netAmount,
      };
    } catch (error) {
      // Rollback on error
      await queryRunner.rollbackTransaction();
      console.error('❌ Transfer failed:', error.message);

      // Log failed transaction (optional)
      try {
        const failedTransaction = this.transactionRepository.create({
          fromUserId,
          toUserId,
          amount,
          type: TransactionType.TRANSFER,
          status: TransactionStatus.FAILED,
          orderId,
          failureReason: error.message,
        });
        await this.transactionRepository.save(failedTransaction);
      } catch (logError) {
        console.error('❌ Failed to log failed transaction:', logError);
      }

      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Refund money to user (used when order is cancelled)
   *
   * @param toUserId - User to refund
   * @param amount - Refund amount
   * @param orderId - Related order ID
   */
  async refund(
    toUserId: string,
    amount: number,
    orderId: string,
    reason: string,
  ): Promise<{ success: boolean; transactionId: string }> {
    if (amount <= 0) {
      throw new BadRequestException('Refund amount must be positive');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Lock and validate user
      const user = await queryRunner.manager.findOne(User, {
        where: { id: toUserId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Create refund transaction
      const transaction = queryRunner.manager.create(Transaction, {
        fromUserId: null, // Platform refunds
        toUserId: toUserId,
        amount,
        type: TransactionType.REFUND,
        status: TransactionStatus.COMPLETED,
        orderId,
        description: reason,
      });
      await queryRunner.manager.save(Transaction, transaction);

      // Update balance
      const newBalance = parseFloat(user.balance.toString()) + amount;
      user.balance = newBalance as any;
      await queryRunner.manager.save(User, user);

      await queryRunner.commitTransaction();

      console.log(`✅ Refund completed: ${user.name}, Amount: ${amount}`);

      return {
        success: true,
        transactionId: transaction.id,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('❌ Refund failed:', error.message);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
