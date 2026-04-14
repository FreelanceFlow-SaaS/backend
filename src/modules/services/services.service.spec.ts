import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ServicesService } from './services.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { mockLoggerProvider } from '../../common/testing/mock-logger';

// Two distinct users to prove tenant isolation
const USER_A = 'user-a-uuid';
const USER_B = 'user-b-uuid';

// hourlyRateHt comes back as Prisma.Decimal from the DB — represented as a string here
// to match what Prisma actually returns in tests
const mockService = {
  id: 'service-uuid-1',
  userId: USER_A,
  title: 'Développement backend',
  hourlyRateHt: '150.00',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

const createDto = {
  title: mockService.title,
  hourlyRateHt: 150.0,
};

describe('ServicesService', () => {
  let service: ServicesService;
  let prisma: { service: Record<string, jest.Mock> };

  beforeEach(async () => {
    prisma = {
      service: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServicesService,
        { provide: PrismaService, useValue: prisma },
        mockLoggerProvider(ServicesService.name),
      ],
    }).compile();

    service = module.get<ServicesService>(ServicesService);
  });

  // ─── create() ────────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('should create and return a service scoped to the authenticated user', async () => {
      prisma.service.create.mockResolvedValue(mockService);

      const result = await service.create(USER_A, createDto);

      expect(prisma.service.create).toHaveBeenCalledWith({
        data: { ...createDto, userId: USER_A },
      });
      expect(result.id).toBe(mockService.id);
      expect(result.userId).toBe(USER_A);
    });
  });

  // ─── findAll() ───────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('should return all services belonging to the user ordered by newest first', async () => {
      prisma.service.findMany.mockResolvedValue([mockService]);

      const result = await service.findAll(USER_A);

      expect(prisma.service.findMany).toHaveBeenCalledWith({
        where: { userId: USER_A },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].userId).toBe(USER_A);
    });

    it('should return an empty array when the user has no services', async () => {
      prisma.service.findMany.mockResolvedValue([]);

      const result = await service.findAll(USER_A);

      expect(result).toEqual([]);
    });
  });

  // ─── findOne() ───────────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('should return the service when it belongs to the user', async () => {
      prisma.service.findFirst.mockResolvedValue(mockService);

      const result = await service.findOne(mockService.id, USER_A);

      expect(prisma.service.findFirst).toHaveBeenCalledWith({
        where: { id: mockService.id, userId: USER_A },
      });
      expect(result.id).toBe(mockService.id);
    });

    it('should throw NotFoundException when service does not exist', async () => {
      prisma.service.findFirst.mockResolvedValue(null);

      await expect(service.findOne('non-existent-id', USER_A)).rejects.toThrow(NotFoundException);
    });

    it('TENANT ISOLATION: should throw NotFoundException (not ForbiddenException) when service belongs to a different user', async () => {
      prisma.service.findFirst.mockResolvedValue(null);

      const error = await service.findOne(mockService.id, USER_B).catch((e) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.getStatus()).toBe(404);
      expect(prisma.service.findFirst).toHaveBeenCalledWith({
        where: { id: mockService.id, userId: USER_B },
      });
    });
  });

  // ─── update() ────────────────────────────────────────────────────────────────

  describe('update()', () => {
    const updateDto = { title: 'Audit technique', hourlyRateHt: 200.0 };
    const updatedService = { ...mockService, ...updateDto, hourlyRateHt: '200.00' };

    it('should update and return the service when it belongs to the user', async () => {
      prisma.service.findFirst.mockResolvedValue(mockService);
      prisma.service.update.mockResolvedValue(updatedService);

      const result = await service.update(mockService.id, USER_A, updateDto);

      expect(prisma.service.update).toHaveBeenCalledWith({
        where: { id: mockService.id },
        data: updateDto,
      });
      expect(result.title).toBe('Audit technique');
    });

    it('should throw NotFoundException when service does not exist', async () => {
      prisma.service.findFirst.mockResolvedValue(null);

      await expect(service.update('non-existent-id', USER_A, updateDto)).rejects.toThrow(
        NotFoundException
      );

      expect(prisma.service.update).not.toHaveBeenCalled();
    });

    it("TENANT ISOLATION: should throw NotFoundException when trying to update another user's service", async () => {
      prisma.service.findFirst.mockResolvedValue(null);

      const error = await service.update(mockService.id, USER_B, updateDto).catch((e) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.getStatus()).toBe(404);
      expect(prisma.service.update).not.toHaveBeenCalled();
    });
  });

  // ─── remove() ────────────────────────────────────────────────────────────────

  describe('remove()', () => {
    it('should delete the service when it belongs to the user', async () => {
      prisma.service.findFirst.mockResolvedValue(mockService);
      prisma.service.delete.mockResolvedValue(mockService);

      await service.remove(mockService.id, USER_A);

      expect(prisma.service.delete).toHaveBeenCalledWith({
        where: { id: mockService.id },
      });
    });

    it('should throw NotFoundException when service does not exist', async () => {
      prisma.service.findFirst.mockResolvedValue(null);

      await expect(service.remove('non-existent-id', USER_A)).rejects.toThrow(NotFoundException);

      expect(prisma.service.delete).not.toHaveBeenCalled();
    });

    it("TENANT ISOLATION: should throw NotFoundException when trying to delete another user's service", async () => {
      prisma.service.findFirst.mockResolvedValue(null);

      const error = await service.remove(mockService.id, USER_B).catch((e) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.getStatus()).toBe(404);
      expect(prisma.service.delete).not.toHaveBeenCalled();
    });
  });
});
