import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Order, OrderStatus } from './order.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { NearbyOrdersDto } from './dto/nearby-orders.dto';
import { LocationGateway } from '../location/location.gateway';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private ordersRepository: Repository<Order>,
    private dataSource: DataSource,
    private locationGateway: LocationGateway,
    private walletService: WalletService,
  ) {}

  async createOrder(
    userId: string,
    createOrderDto: CreateOrderDto,
  ): Promise<Order> {
    const order = this.ordersRepository.create({
      ...createOrderDto,
      requesterId: userId,
      status: OrderStatus.PENDING,
    });

    return await this.ordersRepository.save(order);
  }

  async findNearbyOrders(
    nearbyOrdersDto: NearbyOrdersDto,
    userId: string,
  ): Promise<Array<Order & { distance: number }>> {
    const { latitude, longitude, radius = 1000 } = nearbyOrdersDto;

    // Use PostGIS to calculate distance
    // ST_Distance calculates distance in meters when using geography type
    // ST_MakePoint(longitude, latitude) - note the order!
    const orders = await this.ordersRepository
      .createQueryBuilder('order')
      .select([
        'order.id',
        'order.title',
        'order.description',
        'order.rewardAmount',
        'order.status',
        'order.latitude',
        'order.longitude',
        'order.createdAt',
        'order.requesterId',
      ])
      .addSelect(
        `ST_Distance(
          ST_MakePoint(order.longitude, order.latitude)::geography,
          ST_MakePoint(:longitude, :latitude)::geography
        )`,
        'distance',
      )
      .where('order.status = :status', { status: OrderStatus.PENDING })
      .andWhere('order.requesterId != :userId', { userId })
      .andWhere(
        `ST_DWithin(
          ST_MakePoint(order.longitude, order.latitude)::geography,
          ST_MakePoint(:longitude, :latitude)::geography,
          :radius
        )`,
      )
      .setParameters({ latitude, longitude, radius })
      .orderBy('distance', 'ASC')
      .getRawAndEntities();

    // Combine raw distance data with entities
    return orders.entities.map((order, index) => ({
      ...order,
      distance: parseFloat(orders.raw[index].distance),
    }));
  }

  async findOrderById(orderId: string): Promise<Order> {
    const order = await this.ordersRepository.findOne({
      where: { id: orderId },
      relations: ['requester', 'helper'],
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }

    return order;
  }

  async findOrdersByUser(userId: string): Promise<Order[]> {
    return await this.ordersRepository.find({
      where: [{ requesterId: userId }, { helperId: userId }],
      order: { createdAt: 'DESC' },
    });
  }

  async acceptOrder(orderId: string, helperId: string): Promise<Order> {
    // Use transaction with SELECT FOR UPDATE to prevent race condition
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Lock the row for update (other transactions will wait)
      const order = await queryRunner.manager
        .createQueryBuilder(Order, 'order')
        .setLock('pessimistic_write') // SELECT FOR UPDATE
        .where('order.id = :orderId', { orderId })
        .getOne();

      if (!order) {
        throw new NotFoundException(`Order with ID ${orderId} not found`);
      }

      // Validate order status
      if (order.status !== OrderStatus.PENDING) {
        throw new BadRequestException(
          `Order is already ${order.status.toLowerCase()}. Only PENDING orders can be accepted.`,
        );
      }

      // Validate user is not accepting their own order
      if (order.requesterId === helperId) {
        throw new BadRequestException('You cannot accept your own order');
      }

      // Check if user already has the order
      if (order.helperId === helperId) {
        throw new BadRequestException('You have already accepted this order');
      }

      // Update order status
      order.status = OrderStatus.ACCEPTED;
      order.helperId = helperId;
      order.acceptedAt = new Date();

      await queryRunner.manager.save(order);
      await queryRunner.commitTransaction();

      // Load relations for response
      const updatedOrder = await this.ordersRepository.findOne({
        where: { id: orderId },
        relations: ['requester', 'helper'],
      });

      // Send WebSocket notification to requester
      this.locationGateway.sendOrderAcceptedNotification(order.requesterId, {
        orderId: updatedOrder.id,
        title: updatedOrder.title,
        helperName: updatedOrder.helper.name,
        helperId: updatedOrder.helperId,
        message: `Your order "${updatedOrder.title}" has been accepted!`,
      });

      return updatedOrder;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async completeOrder(orderId: string, userId: string): Promise<Order> {
    const order = await this.ordersRepository.findOne({
      where: { id: orderId },
      relations: ['requester', 'helper'],
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }

    // Only requester can mark order as completed
    if (order.requesterId !== userId) {
      throw new BadRequestException('Only the requester can mark this order as completed');
    }

    // Order must be ACCEPTED to be completed
    if (order.status !== OrderStatus.ACCEPTED) {
      throw new BadRequestException(
        `Order must be ACCEPTED to be completed. Current status: ${order.status}`,
      );
    }

    // Transfer reward from requester to helper (10% platform fee)
    try {
      const transferResult = await this.walletService.transfer(
        order.requesterId,
        order.helperId,
        order.rewardAmount,
        order.id,
        10, // 10% platform fee
      );

      console.log(
        `💰 Payment completed for order ${orderId}: ${order.rewardAmount} (${transferResult.netAmount} after fee)`,
      );
    } catch (error) {
      throw new BadRequestException(
        `Payment failed: ${error.message}. Order cannot be completed.`,
      );
    }

    // Update status
    order.status = OrderStatus.COMPLETED;
    order.completedAt = new Date();

    await this.ordersRepository.save(order);

    // Send WebSocket notification to helper
    this.locationGateway.sendOrderAcceptedNotification(order.helperId, {
      orderId: order.id,
      title: order.title,
      status: 'COMPLETED',
      message: `Order "${order.title}" has been marked as completed!`,
    });

    return order;
  }

  async updateOrder(
    orderId: string,
    userId: string,
    updateOrderDto: UpdateOrderDto,
  ): Promise<Order> {
    const order = await this.ordersRepository.findOne({
      where: { id: orderId },
      relations: ['requester'],
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }

    // Only requester can edit order
    if (order.requesterId !== userId) {
      throw new BadRequestException('Only the requester can edit this order');
    }

    // Only PENDING or CANCELLED orders can be edited
    if (order.status !== OrderStatus.PENDING && order.status !== OrderStatus.CANCELLED) {
      throw new BadRequestException(
        `Cannot edit order with status ${order.status}. Only PENDING or CANCELLED orders can be edited.`,
      );
    }

    // If editing a CANCELLED order, reactivate it to PENDING
    if (order.status === OrderStatus.CANCELLED) {
      order.status = OrderStatus.PENDING;
    }

    // Update fields
    if (updateOrderDto.title !== undefined) {
      order.title = updateOrderDto.title;
    }
    if (updateOrderDto.description !== undefined) {
      order.description = updateOrderDto.description;
    }
    if (updateOrderDto.rewardAmount !== undefined) {
      order.rewardAmount = updateOrderDto.rewardAmount;
    }

    return await this.ordersRepository.save(order);
  }

  async cancelOrder(orderId: string, userId: string): Promise<Order> {
    const order = await this.ordersRepository.findOne({
      where: { id: orderId },
      relations: ['requester', 'helper'],
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }

    // Both requester and helper can cancel
    if (order.requesterId !== userId && order.helperId !== userId) {
      throw new BadRequestException('Only the requester or helper can cancel this order');
    }

    // Cannot cancel completed orders
    if (order.status === OrderStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel a completed order');
    }

    // Already cancelled by requester
    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Order is already cancelled');
    }

    const isRequester = order.requesterId === userId;
    const isHelper = order.helperId === userId;

    // Different logic for requester vs helper cancel
    if (isRequester) {
      // Requester cancel: mark as CANCELLED (permanent)
      order.status = OrderStatus.CANCELLED;
      await this.ordersRepository.save(order);

      // Notify helper if exists
      if (order.helperId) {
        this.locationGateway.sendOrderAcceptedNotification(order.helperId, {
          orderId: order.id,
          title: order.title,
          status: 'CANCELLED',
          message: `Order "${order.title}" has been cancelled by requester`,
        });
      }
    } else if (isHelper) {
      // Helper cancel: return to PENDING (helper can re-accept later)
      if (order.status === OrderStatus.PENDING) {
        throw new BadRequestException('Order is not accepted yet');
      }

      order.status = OrderStatus.PENDING;
      order.helperId = null;
      order.helper = null;
      order.acceptedAt = null;
      await this.ordersRepository.save(order);

      // Notify requester
      this.locationGateway.sendOrderAcceptedNotification(order.requesterId, {
        orderId: order.id,
        title: order.title,
        status: 'PENDING',
        message: `Helper has withdrawn from order "${order.title}". Order is now available again.`,
      });
    }

    return order;
  }
}
