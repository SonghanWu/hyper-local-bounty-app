import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async findByPhone(phone: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { phone } });
  }

  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  async create(userData: Partial<User>): Promise<User> {
    const user = this.usersRepository.create(userData);
    return this.usersRepository.save(user);
  }

  async updateUserLocation(
    userId: string,
    locationData: {
      lastLatitude: number;
      lastLongitude: number;
      lastLocationUpdatedAt: Date;
    },
  ): Promise<void> {
    await this.usersRepository.update(userId, locationData);
  }

  async updatePushNotifications(
    userId: string,
    enabled: boolean,
  ): Promise<void> {
    await this.usersRepository.update(userId, {
      pushNotificationsEnabled: enabled,
    });
  }
}
