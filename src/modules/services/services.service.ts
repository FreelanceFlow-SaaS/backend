import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { Service } from '../users/user.entity';

@Injectable()
export class ServicesService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectPinoLogger(ServicesService.name)
    private readonly logger: PinoLogger
  ) {}

  async create(userId: string, dto: CreateServiceDto): Promise<Service> {
    const service = await this.prisma.service.create({
      data: { ...dto, userId },
    });
    this.logger.info(
      { 'event.action': 'service_created', userId, serviceId: service.id },
      'service created'
    );
    return service as unknown as Service;
  }

  async findAll(userId: string): Promise<Service[]> {
    return this.prisma.service.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    }) as unknown as Promise<Service[]>;
  }

  async findOne(id: string, userId: string): Promise<Service> {
    // Single query — collapses existence and ownership check atomically.
    // A miss on either returns the same 404, preventing resource existence leaks.
    const service = await this.prisma.service.findFirst({
      where: { id, userId },
    });

    if (!service) {
      throw new NotFoundException('Prestation introuvable');
    }

    return service as unknown as Service;
  }

  async update(id: string, userId: string, dto: UpdateServiceDto): Promise<Service> {
    await this.findOne(id, userId); // ownership check — throws 404 if not found or not owned

    const service = await this.prisma.service.update({
      where: { id },
      data: dto,
    });
    this.logger.info(
      { 'event.action': 'service_updated', userId, serviceId: id },
      'service updated'
    );
    return service as unknown as Service;
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.findOne(id, userId); // ownership check — throws 404 if not found or not owned

    await this.prisma.service.delete({ where: { id } });
    this.logger.info(
      { 'event.action': 'service_deleted', userId, serviceId: id },
      'service deleted'
    );
  }
}
