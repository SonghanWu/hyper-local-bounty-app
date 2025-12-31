import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { NearbyOrdersDto } from './dto/nearby-orders.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/user.entity';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  async createOrder(
    @CurrentUser() user: User,
    @Body() createOrderDto: CreateOrderDto,
  ) {
    const order = await this.ordersService.createOrder(user.id, createOrderDto);
    return {
      success: true,
      order,
    };
  }

  @Get('nearby')
  async findNearbyOrders(
    @Query() nearbyOrdersDto: NearbyOrdersDto,
    @CurrentUser() user: User,
  ) {
    const orders = await this.ordersService.findNearbyOrders(
      nearbyOrdersDto,
      user.id,
    );
    return {
      success: true,
      count: orders.length,
      orders,
    };
  }

  @Get('my-orders')
  async getMyOrders(@CurrentUser() user: User) {
    const orders = await this.ordersService.findOrdersByUser(user.id);
    return {
      success: true,
      count: orders.length,
      orders,
    };
  }

  @Get(':id')
  async getOrderById(@Param('id') id: string) {
    const order = await this.ordersService.findOrderById(id);
    return {
      success: true,
      order,
    };
  }

  @Post(':id/accept')
  async acceptOrder(@Param('id') id: string, @CurrentUser() user: User) {
    const order = await this.ordersService.acceptOrder(id, user.id);
    return {
      success: true,
      message: 'Order accepted successfully',
      order,
    };
  }

  @Post(':id/complete')
  async completeOrder(@Param('id') id: string, @CurrentUser() user: User) {
    const order = await this.ordersService.completeOrder(id, user.id);
    return {
      success: true,
      message: 'Order marked as completed',
      order,
    };
  }

  @Post(':id/cancel')
  async cancelOrder(@Param('id') id: string, @CurrentUser() user: User) {
    const order = await this.ordersService.cancelOrder(id, user.id);
    return {
      success: true,
      message: 'Order cancelled',
      order,
    };
  }

  @Put(':id')
  async updateOrder(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() updateOrderDto: UpdateOrderDto,
  ) {
    const order = await this.ordersService.updateOrder(id, user.id, updateOrderDto);
    return {
      success: true,
      message: 'Order updated successfully',
      order,
    };
  }
}
