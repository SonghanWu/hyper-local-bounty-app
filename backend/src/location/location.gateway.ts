import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { JwtService } from '@nestjs/jwt';

interface LocationUpdatePayload {
  latitude: number;
  longitude: number;
}

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
})
export class LocationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  constructor(
    private redisService: RedisService,
    private jwtService: JwtService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      // Extract JWT token from handshake
      const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.split(' ')[1];

      if (!token) {
        client.disconnect();
        return;
      }

      // Verify JWT
      const payload = this.jwtService.verify(token);
      const userId = payload.sub;

      // Store userId in socket data
      client.data.userId = userId;

      console.log(`✅ User ${userId} connected via WebSocket`);
    } catch (error) {
      console.error('WebSocket authentication failed:', error.message);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    if (userId) {
      // Optionally remove user location from Redis when they disconnect
      // await this.redisService.removeUserLocation(userId);
      console.log(`❌ User ${userId} disconnected from WebSocket`);
    }
  }

  @SubscribeMessage('update_location')
  async handleLocationUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: LocationUpdatePayload,
  ) {
    const userId = client.data.userId;

    if (!userId) {
      return { error: 'Unauthorized' };
    }

    const { latitude, longitude } = data;

    // Validate coordinates
    if (
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return { error: 'Invalid coordinates' };
    }

    try {
      // Update location in Redis
      await this.redisService.updateUserLocation(userId, longitude, latitude);

      console.log(`📍 Updated location for user ${userId}: (${latitude}, ${longitude})`);

      return {
        success: true,
        message: 'Location updated successfully',
      };
    } catch (error) {
      console.error('Failed to update location:', error);
      return { error: 'Failed to update location' };
    }
  }

  @SubscribeMessage('get_nearby_users')
  async handleGetNearbyUsers(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { latitude: number; longitude: number; radius?: number },
  ) {
    const userId = client.data.userId;

    if (!userId) {
      return { error: 'Unauthorized' };
    }

    const { latitude, longitude, radius = 500 } = data;

    try {
      const nearbyUsers = await this.redisService.getNearbyUsers(
        longitude,
        latitude,
        radius,
      );

      // Filter out the requesting user
      // nearbyUsers is an array of objects with member, distance, coordinates
      const filteredUsers = (nearbyUsers as any[]).filter(
        (user: any) => user.member !== userId,
      );

      return {
        success: true,
        users: filteredUsers,
      };
    } catch (error) {
      console.error('Failed to get nearby users:', error);
      return { error: 'Failed to get nearby users' };
    }
  }
}
