import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { Client } from '../users/user.entity';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateClientDto): Promise<Client> {
    return this.prisma.client.create({
      data: { ...dto, userId },
    }) as Promise<Client>;
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

    return this.prisma.client.update({
      where: { id },
      data: dto,
    }) as Promise<Client>;
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.findOne(id, userId); // ownership check — throws 404 if not found or not owned

    await this.prisma.client.delete({ where: { id } });
  }
}
