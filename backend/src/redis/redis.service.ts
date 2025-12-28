import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: RedisClientType;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    this.client = createClient({
      socket: {
        host: this.configService.get<string>('REDIS_HOST', 'localhost'),
        port: this.configService.get<number>('REDIS_PORT', 6379),
      },
    });

    this.client.on('error', (err) => console.error('Redis Client Error', err));
    await this.client.connect();
    console.log('✅ Redis connected');
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  getClient(): RedisClientType {
    return this.client;
  }

  /**
   * Update user's location in Redis using GEOADD
   * @param userId User ID
   * @param longitude Longitude
   * @param latitude Latitude
   */
  async updateUserLocation(
    userId: string,
    longitude: number,
    latitude: number,
  ): Promise<void> {
    const key = 'users:locations';
    await this.client.geoAdd(key, {
      longitude,
      latitude,
      member: userId,
    });

    // Set TTL marker - expires in 5 minutes (300 seconds)
    // If user doesn't update location for 5 minutes, they're considered offline
    const ttlKey = `user:${userId}:location_active`;
    await this.client.setEx(ttlKey, 300, '1');
  }

  /**
   * Get users within a radius
   * @param longitude Center longitude
   * @param latitude Center latitude
   * @param radiusInMeters Radius in meters
   */
  async getNearbyUsers(
    longitude: number,
    latitude: number,
    radiusInMeters: number,
  ): Promise<any> {
    const key = 'users:locations';
    // Using type assertion due to Redis client type definition issues
    const allUsers = await (this.client as any).geoRadiusWith(
      key,
      { longitude, latitude },
      radiusInMeters,
      'm',
      ['WITHDIST', 'WITHCOORD'],
    );

    // Filter out users whose TTL has expired (inactive for 5+ minutes)
    const activeUsers = [];
    for (const user of allUsers) {
      const userId = user.member;
      const ttlKey = `user:${userId}:location_active`;
      const isActive = await this.client.exists(ttlKey);

      if (isActive) {
        activeUsers.push(user);
      } else {
        // Clean up stale location data
        await this.removeUserLocation(userId);
      }
    }

    return activeUsers;
  }

  /**
   * Remove user's location from Redis
   * @param userId User ID
   */
  async removeUserLocation(userId: string): Promise<void> {
    const key = 'users:locations';
    await this.client.zRem(key, userId);

    // Also remove TTL marker
    const ttlKey = `user:${userId}:location_active`;
    await this.client.del(ttlKey);
  }
}
