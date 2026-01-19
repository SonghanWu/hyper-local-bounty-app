import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import * as bcrypt from 'bcrypt';
import { Expo } from 'expo-server-sdk';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Get current user profile
   * GET /users/me
   */
  @Get('me')
  async getCurrentUser(@Request() req) {
    const user = await this.usersService.findById(req.user.id);
    // Don't send password to client
    const { password, ...userWithoutPassword } = user;
    return {
      success: true,
      user: userWithoutPassword,
    };
  }

  /**
   * Update current user profile
   * PATCH /users/me
   */
  @Patch('me')
  async updateCurrentUser(
    @Request() req,
    @Body()
    updateData: {
      name?: string;
      currentPassword?: string;
      newPassword?: string;
      notificationRadius?: number;
    },
  ) {
    const userId = req.user.id;
    const user = await this.usersService.findById(userId);

    // Update name if provided
    if (updateData.name && updateData.name.trim()) {
      user.name = updateData.name.trim();
    }

    // Update notification radius if provided
    if (updateData.notificationRadius !== undefined) {
      const validRadii = [500, 1000, 2000, 5000]; // 0.5km, 1km, 2km, 5km
      if (!validRadii.includes(updateData.notificationRadius)) {
        throw new BadRequestException(
          'Invalid notification radius. Must be one of: 500, 1000, 2000, 5000',
        );
      }
      user.notificationRadius = updateData.notificationRadius;
    }

    // Update password if both currentPassword and newPassword are provided
    if (updateData.currentPassword && updateData.newPassword) {
      // Verify current password
      const isPasswordValid = await bcrypt.compare(
        updateData.currentPassword,
        user.password,
      );

      if (!isPasswordValid) {
        throw new BadRequestException('Current password is incorrect');
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(updateData.newPassword, 10);
      user.password = hashedPassword;
    }

    // Save updated user
    await this.usersService.update(userId, user);

    // Return user without password
    const { password, ...userWithoutPassword } = user;

    return {
      success: true,
      message: 'Profile updated successfully',
      user: userWithoutPassword,
    };
  }

  /**
   * Save Expo push token for notifications
   * POST /users/push-token
   */
  @Post('push-token')
  async savePushToken(
    @Request() req,
    @Body() body: { expoPushToken: string },
  ) {
    const userId = req.user.id;
    const { expoPushToken } = body;

    // Validate token format
    if (!expoPushToken || !Expo.isExpoPushToken(expoPushToken)) {
      throw new BadRequestException('Invalid Expo push token format');
    }

    // Update user's push token and enable push notifications
    const user = await this.usersService.findById(userId);
    user.expoPushToken = expoPushToken;
    user.pushNotificationsEnabled = true; // Auto-enable when token is registered
    await this.usersService.update(userId, user);

    console.log(`Push token saved for user ${userId}: ${expoPushToken}`);

    return {
      success: true,
      message: 'Push token saved successfully',
    };
  }
}
