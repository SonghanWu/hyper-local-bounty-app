import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Order } from '../orders/order.entity';

@Entity('chat_messages')
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Order this message belongs to (chat room)
  @ManyToOne(() => Order, { nullable: false })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column()
  orderId: string;

  // User who sent the message
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'senderId' })
  sender: User;

  @Column()
  senderId: string;

  // Message content
  @Column('text')
  message: string;

  @CreateDateColumn()
  createdAt: Date;
}
