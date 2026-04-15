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
    this.logger.info(
      { 'event.action': 'client_created', userId, clientId: client.id },
      'client created'
    );
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
    this.logger.info({ 'event.action': 'client_updated', userId, clientId: id }, 'client updated');
    return client as Client;
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.findOne(id, userId); // ownership check — throws 404 if not found or not owned

    await this.prisma.client.delete({ where: { id } });
    this.logger.info({ 'event.action': 'client_deleted', userId, clientId: id }, 'client deleted');
  }

  async exportCsv(userId: string): Promise<string> {
    const clients = await this.prisma.client.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    });

    const headers = [
      'Nom',
      'Email',
      'Entreprise',
      'Adresse',
      'Code postal',
      'Ville',
      'Pays',
      'Date de création',
    ];
    const rows = clients.map((c) => [
      c.name ?? '',
      c.email ?? '',
      c.company ?? '',
      c.addressLine1 ?? '',
      c.zipCode ?? '',
      c.city ?? '',
      c.country ?? '',
      formatDate(c.createdAt),
    ]);

    this.logger.info(
      { 'event.action': 'clients_exported', userId, count: clients.length },
      'clients CSV exported'
    );
    return [headers, ...rows].map((row) => row.map(csvField).join(';')).join('\r\n');
  }
}

// Returns dd/MM/yyyy without relying on Node ICU locale.
function formatDate(date: Date): string {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${d}/${m}/${date.getFullYear()}`;
}

// Quotes a CSV field if it contains the separator, quotes, or newlines.
function csvField(value: string): string {
  if (value.includes(';') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
