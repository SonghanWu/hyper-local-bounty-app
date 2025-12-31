import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Order } from '../orders/order.entity';

export enum TransactionType {
  TRANSFER = 'TRANSFER',           // User-to-user transfer
  PLATFORM_FEE = 'PLATFORM_FEE',   // Platform commission
  REFUND = 'REFUND',               // Order cancellation refund
  TOP_UP = 'TOP_UP',               // Account balance top-up (future)
  WITHDRAWAL = 'WITHDRAWAL',       // Cash out (future)
}

export enum TransactionStatus {
  PENDING = 'PENDING',       // Transaction initiated
  COMPLETED = 'COMPLETED',   // Transaction successful
  FAILED = 'FAILED',         // Transaction failed
  CANCELLED = 'CANCELLED',   // Transaction cancelled
}

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Sender (null for TOP_UP transactions)
  @Column({ type: 'uuid', nullable: true })
  fromUserId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'fromUserId' })
  fromUser: User;

  // Receiver (null for WITHDRAWAL transactions)
  @Column({ type: 'uuid', nullable: true })
  toUserId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'toUserId' })
  toUser: User;

  // Transaction amount (always positive)
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  // Transaction type
  @Column({
    type: 'enum',
    enum: TransactionType,
    default: TransactionType.TRANSFER,
  })
  type: TransactionType;

  // Transaction status
  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
  })
  status: TransactionStatus;

  // Related order (optional)
  @Column({ type: 'uuid', nullable: true })
  orderId: string;

  @ManyToOne(() => Order, { nullable: true })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  // Description/note
  @Column({ type: 'text', nullable: true })
  description: string;

  // Failure reason (if status = FAILED)
  @Column({ type: 'text', nullable: true })
  failureReason: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
