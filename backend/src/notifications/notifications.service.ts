import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { User } from '../users/user.entity';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class NotificationsService {
  private expo: Expo;

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private redisService: RedisService,
  ) {
    this.expo = new Expo();
  }

  /**
   * Find users near a location who should be notified
   * Uses each user's personal notification radius preference
   * Priority: Online users in Redis, fallback to recently active users in PostgreSQL
   */
  async findNearbyUsers(
    location: { latitude: number; longitude: number },
  ): Promise<Array<User & { distance: number }>> {
    const { latitude, longitude } = location;
    const maxRadius = 5000; // Query users within max possible radius (5km)

    try {
      // Step 1: Try to get online users from Redis
      const onlineUserIds = await this.getOnlineUserIds();

      if (onlineUserIds.length > 0) {
        // Query PostgreSQL for online users with push tokens
        const onlineUsers = await this.usersRepository
          .createQueryBuilder('user')
          .select([
            'user.id',
            'user.name',
            'user.expoPushToken',
            'user.pushNotificationsEnabled',
            'user.notificationRadius',
            'user.lastLatitude',
            'user.lastLongitude',
          ])
          .addSelect(
            `ST_Distance(
              ST_MakePoint(user.lastLongitude, user.lastLatitude)::geography,
              ST_MakePoint(:longitude, :latitude)::geography
            )`,
            'distance',
          )
          .where('user.id IN (:...userIds)', { userIds: onlineUserIds })
          .andWhere('user.pushNotificationsEnabled = true')
          .andWhere('user.expoPushToken IS NOT NULL')
          .andWhere('user.lastLatitude IS NOT NULL')
          .andWhere('user.lastLongitude IS NOT NULL')
          .andWhere(
            `ST_DWithin(
              ST_MakePoint(user.lastLongitude, user.lastLatitude)::geography,
              ST_MakePoint(:longitude, :latitude)::geography,
              :radius
            )`,
          )
          .setParameters({ latitude, longitude, radius: maxRadius })
          .orderBy('distance', 'ASC')
          .getRawAndEntities();

        // Filter users based on their personal notification radius
        return onlineUsers.entities
          .map((user, index) => ({
            ...user,
            distance: parseFloat(onlineUsers.raw[index].distance),
          }))
          .filter((user) => user.distance <= user.notificationRadius);
      }
    } catch (error) {
      console.error('Error fetching online users from Redis:', error);
    }

    // Step 2: Fallback - get recently active users from PostgreSQL (last 30 minutes)
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    const recentUsers = await this.usersRepository
      .createQueryBuilder('user')
      .select([
        'user.id',
        'user.name',
        'user.expoPushToken',
        'user.pushNotificationsEnabled',
        'user.notificationRadius',
        'user.lastLatitude',
        'user.lastLongitude',
      ])
      .addSelect(
        `ST_Distance(
          ST_MakePoint(user.lastLongitude, user.lastLatitude)::geography,
          ST_MakePoint(:longitude, :latitude)::geography
        )`,
        'distance',
      )
      .where('user.pushNotificationsEnabled = true')
      .andWhere('user.expoPushToken IS NOT NULL')
      .andWhere('user.lastLatitude IS NOT NULL')
      .andWhere('user.lastLongitude IS NOT NULL')
      .andWhere('user.lastLocationUpdatedAt > :thirtyMinutesAgo', {
        thirtyMinutesAgo,
      })
      .andWhere(
        `ST_DWithin(
          ST_MakePoint(user.lastLongitude, user.lastLatitude)::geography,
          ST_MakePoint(:longitude, :latitude)::geography,
          :radius
        )`,
      )
      .setParameters({ latitude, longitude, radius: maxRadius })
      .orderBy('distance', 'ASC')
      .getRawAndEntities();

    // Filter users based on their personal notification radius
    return recentUsers.entities
      .map((user, index) => ({
        ...user,
        distance: parseFloat(recentUsers.raw[index].distance),
      }))
      .filter((user) => user.distance <= user.notificationRadius);
  }

  /**
   * Get list of online user IDs from Redis
   */
  private async getOnlineUserIds(): Promise<string[]> {
    try {
      const client = this.redisService.getClient();
      const keys = await client.keys('user:*:ttl');
      const userIds: string[] = [];

      for (const key of keys) {
        const ttl = await client.ttl(key);
        if (ttl > 0) {
          // Extract user ID from key: "user:UUID:ttl"
          const userId = key.split(':')[1];
          userIds.push(userId);
        }
      }

      return userIds;
    } catch (error) {
      console.error('Error getting online user IDs from Redis:', error);
      return [];
    }
  }

  /**
   * Send push notification about new order to nearby users
   * Each user's personal notification radius preference is respected
   */
  async sendNewOrderNotification(
    orderId: string,
    orderTitle: string,
    orderReward: number,
    orderLocation: { latitude: number; longitude: number },
    requesterId: string, // Don't notify the order creator
  ): Promise<void> {
    try {
      // Find nearby users (filtered by each user's notificationRadius)
      const nearbyUsers = await this.findNearbyUsers(orderLocation);

      // Filter out the requester
      const usersToNotify = nearbyUsers.filter(
        (user) => user.id !== requesterId,
      );

      if (usersToNotify.length === 0) {
        console.log('No nearby users to notify');
        return;
      }

      console.log(`Sending notifications to ${usersToNotify.length} nearby users`);

      // Prepare push messages
      const messages: ExpoPushMessage[] = usersToNotify.map((user) => ({
        to: user.expoPushToken,
        sound: 'default',
        title: '🎯 附近有新订单！',
        body: `${orderTitle} - $${orderReward} (距离 ${Math.round(user.distance)}m)`,
        data: {
          type: 'NEW_ORDER',
          orderId,
          distance: user.distance,
        },
        priority: 'high',
      }));

      // Send notifications in chunks
      const chunks = this.expo.chunkPushNotifications(messages);

      for (const chunk of chunks) {
        try {
          const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
          console.log('Push notification tickets:', ticketChunk);

          // TODO: Store tickets for later verification if needed
        } catch (error) {
          console.error('Error sending push notification chunk:', error);
        }
      }
    } catch (error) {
      console.error('Error in sendNewOrderNotification:', error);
    }
  }

  /**
   * Validate Expo push token format
   */
  isValidExpoPushToken(token: string): boolean {
    return Expo.isExpoPushToken(token);
  }
}
