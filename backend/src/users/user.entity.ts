import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Exclude } from 'class-transformer';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, nullable: true })
  email: string;

  @Column({ unique: true, nullable: true })
  phone: string;

  @Column()
  @Exclude()
  password: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  avatar: string;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  rating: number;

  // Location fields
  @Column({ type: 'decimal', precision: 10, scale: 8, nullable: true })
  lastLatitude: number;

  @Column({ type: 'decimal', precision: 11, scale: 8, nullable: true })
  lastLongitude: number;

  @Column({ type: 'timestamp', nullable: true })
  lastLocationUpdatedAt: Date;

  // Future extension: Background location updates (Phase 4+)
  @Column({ default: false })
  backgroundLocationEnabled: boolean;

  // Push notification control
  @Column({ default: true })
  pushNotificationsEnabled: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
