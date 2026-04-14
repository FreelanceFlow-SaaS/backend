import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { Client } from '../users/user.entity';

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectPinoLogger(ClientsService.name)
    private readonly logger: PinoLogger
  ) {}

  async create(userId: string, dto: CreateClientDto): Promise<Client> {
    const client = await this.prisma.client.create({
      data: { ...dto, userId },
    });
    this.logger.info({ event: 'client_created', userId, clientId: client.id }, 'client created');
    return client as Client;
  }

  async findAll(userId: string): Promise<Client[]> {
    return this.prisma.client.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    }) as Promise<Client[]>;
  }

  async findOne(id: string, userId: string): Promise<Client> {
    // Single query — collapses existence check and ownership check atomically.
    // A miss on either (not found or belongs to another user) returns the same 404.
    // This prevents leaking whether a resource exists to other users.
    const client = await this.prisma.client.findFirst({
      where: { id, userId },
    });

    if (!client) {
      throw new NotFoundException('Client introuvable');
    }

    return client as Client;
  }

  async update(id: string, userId: string, dto: UpdateClientDto): Promise<Client> {
    await this.findOne(id, userId); // ownership check — throws 404 if not found or not owned

    const client = await this.prisma.client.update({
      where: { id },
      data: dto,
    });
    this.logger.info({ event: 'client_updated', userId, clientId: id }, 'client updated');
    return client as Client;
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.findOne(id, userId); // ownership check — throws 404 if not found or not owned

    await this.prisma.client.delete({ where: { id } });
    this.logger.info({ event: 'client_deleted', userId, clientId: id }, 'client deleted');
  }
}
