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
    return await (this.client as any).geoRadiusWith(
      key,
      { longitude, latitude },
      radiusInMeters,
      'm',
      ['WITHDIST', 'WITHCOORD'],
    );
  }

  /**
   * Remove user's location from Redis
   * @param userId User ID
   */
  async removeUserLocation(userId: string): Promise<void> {
    const key = 'users:locations';
    await this.client.zRem(key, userId);
  }
}
