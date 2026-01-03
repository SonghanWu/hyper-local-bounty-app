import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import * as bcrypt from 'bcrypt';

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
    @Body() updateData: { name?: string; currentPassword?: string; newPassword?: string },
  ) {
    const userId = req.user.id;
    const user = await this.usersService.findById(userId);

    // Update name if provided
    if (updateData.name && updateData.name.trim()) {
      user.name = updateData.name.trim();
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
}
