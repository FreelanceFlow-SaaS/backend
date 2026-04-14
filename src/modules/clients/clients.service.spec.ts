import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { mockLoggerProvider } from '../../common/testing/mock-logger';

// Two distinct users to prove tenant isolation
const USER_A = 'user-a-uuid';
const USER_B = 'user-b-uuid';

const mockClient = {
  id: 'client-uuid-1',
  userId: USER_A,
  name: 'Sophie Martin',
  email: 'sophie@acme.fr',
  company: 'Acme SAS',
  addressLine1: '42 rue du Commerce',
  zipCode: '75015',
  city: 'Paris',
  country: 'FR',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

const createDto = {
  name: mockClient.name,
  email: mockClient.email,
  company: mockClient.company,
  addressLine1: mockClient.addressLine1,
  zipCode: mockClient.zipCode,
  city: mockClient.city,
  country: mockClient.country,
};

describe('ClientsService', () => {
  let service: ClientsService;
  let prisma: { client: Record<string, jest.Mock> };

  beforeEach(async () => {
    prisma = {
      client: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientsService,
        { provide: PrismaService, useValue: prisma },
        mockLoggerProvider(ClientsService.name),
      ],
    }).compile();

    service = module.get<ClientsService>(ClientsService);
  });

  // ─── create() ────────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('should create and return a client scoped to the authenticated user', async () => {
      prisma.client.create.mockResolvedValue(mockClient);

      const result = await service.create(USER_A, createDto);

      expect(prisma.client.create).toHaveBeenCalledWith({
        data: { ...createDto, userId: USER_A },
      });
      expect(result.id).toBe(mockClient.id);
      expect(result.userId).toBe(USER_A);
    });
  });

  // ─── findAll() ───────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('should return all clients belonging to the user ordered by newest first', async () => {
      prisma.client.findMany.mockResolvedValue([mockClient]);

      const result = await service.findAll(USER_A);

      expect(prisma.client.findMany).toHaveBeenCalledWith({
        where: { userId: USER_A },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].userId).toBe(USER_A);
    });

    it('should return an empty array when the user has no clients', async () => {
      prisma.client.findMany.mockResolvedValue([]);

      const result = await service.findAll(USER_A);

      expect(result).toEqual([]);
    });
  });

  // ─── findOne() ───────────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('should return the client when it belongs to the user', async () => {
      prisma.client.findFirst.mockResolvedValue(mockClient);

      const result = await service.findOne(mockClient.id, USER_A);

      expect(prisma.client.findFirst).toHaveBeenCalledWith({
        where: { id: mockClient.id, userId: USER_A },
      });
      expect(result.id).toBe(mockClient.id);
    });

    it('should throw NotFoundException when client does not exist', async () => {
      prisma.client.findFirst.mockResolvedValue(null);

      await expect(service.findOne('non-existent-id', USER_A)).rejects.toThrow(NotFoundException);
    });

    it('TENANT ISOLATION: should throw NotFoundException (not ForbiddenException) when client belongs to a different user', async () => {
      // findFirst returns null because the userId filter excludes the row
      prisma.client.findFirst.mockResolvedValue(null);

      const error = await service.findOne(mockClient.id, USER_B).catch((e) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      // Critically: must NOT be ForbiddenException — that would reveal the resource exists
      expect(error.getStatus()).toBe(404);
      // Verify the query included USER_B's id — not USER_A's
      expect(prisma.client.findFirst).toHaveBeenCalledWith({
        where: { id: mockClient.id, userId: USER_B },
      });
    });
  });

  // ─── update() ────────────────────────────────────────────────────────────────

  describe('update()', () => {
    const updateDto = { name: 'Sophie Dupont', company: 'Dupont SAS' };
    const updatedClient = { ...mockClient, ...updateDto };

    it('should update and return the client when it belongs to the user', async () => {
      prisma.client.findFirst.mockResolvedValue(mockClient);
      prisma.client.update.mockResolvedValue(updatedClient);

      const result = await service.update(mockClient.id, USER_A, updateDto);

      expect(prisma.client.update).toHaveBeenCalledWith({
        where: { id: mockClient.id },
        data: updateDto,
      });
      expect(result.name).toBe('Sophie Dupont');
    });

    it('should throw NotFoundException when client does not exist', async () => {
      prisma.client.findFirst.mockResolvedValue(null);

      await expect(service.update('non-existent-id', USER_A, updateDto)).rejects.toThrow(
        NotFoundException
      );

      expect(prisma.client.update).not.toHaveBeenCalled();
    });

    it("TENANT ISOLATION: should throw NotFoundException when trying to update another user's client", async () => {
      prisma.client.findFirst.mockResolvedValue(null);

      const error = await service.update(mockClient.id, USER_B, updateDto).catch((e) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.getStatus()).toBe(404);
      expect(prisma.client.update).not.toHaveBeenCalled();
    });
  });

  // ─── remove() ────────────────────────────────────────────────────────────────

  describe('remove()', () => {
    it('should delete the client when it belongs to the user', async () => {
      prisma.client.findFirst.mockResolvedValue(mockClient);
      prisma.client.delete.mockResolvedValue(mockClient);

      await service.remove(mockClient.id, USER_A);

      expect(prisma.client.delete).toHaveBeenCalledWith({
        where: { id: mockClient.id },
      });
    });

    it('should throw NotFoundException when client does not exist', async () => {
      prisma.client.findFirst.mockResolvedValue(null);

      await expect(service.remove('non-existent-id', USER_A)).rejects.toThrow(NotFoundException);

      expect(prisma.client.delete).not.toHaveBeenCalled();
    });

    it("TENANT ISOLATION: should throw NotFoundException when trying to delete another user's client", async () => {
      prisma.client.findFirst.mockResolvedValue(null);

      const error = await service.remove(mockClient.id, USER_B).catch((e) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.getStatus()).toBe(404);
      expect(prisma.client.delete).not.toHaveBeenCalled();
    });
  });
});
