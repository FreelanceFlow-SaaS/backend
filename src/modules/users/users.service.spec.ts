import { NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import { UsersService } from './users.service';
import { mockLoggerValue } from '../../common/testing/mock-logger';

/**
 * Set in jest.mock factory. Declared with `var` (no TDZ) so the hoisted factory can assign safely.
 * Used in beforeEach instead of jest.requireActual (avoids @typescript-eslint/no-require-imports).
 */
var realFsExistsSync: (typeof import('fs'))['existsSync'];
var realFsCreateReadStream: (typeof import('fs'))['createReadStream'];

jest.mock('fs', () => {
  const actual = jest.requireActual<typeof import('fs')>('fs');
  realFsExistsSync = actual.existsSync;
  realFsCreateReadStream = actual.createReadStream;
  return {
    ...actual,
    existsSync: jest.fn((...args: Parameters<typeof actual.existsSync>) =>
      actual.existsSync(...args)
    ),
    createReadStream: jest.fn((...args: Parameters<typeof actual.createReadStream>) =>
      actual.createReadStream(...args)
    ),
  };
});

const USER_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const mockUser = {
  id: USER_ID,
  email: 'sophie@freelanceflow.test',
  passwordHash: '$2a$12$hashedpassword',
  createdAt: new Date(),
  updatedAt: new Date(),
  profile: null,
};

const mockProfile = {
  id: 'profile-uuid-1',
  userId: USER_ID,
  displayName: 'Sophie Martin',
  legalName: 'Sophie Marie Martin',
  companyName: null,
  addressLine1: '123 rue de la Paix',
  addressLine2: null,
  postalCode: '75001',
  city: 'Paris',
  country: 'FR',
  vatNumber: null,
  siret: null,
  updatedAt: new Date(),
};

const mockPrisma = {
  user: {
    create: jest.fn(),
    findUnique: jest.fn(),
  },
  freelancerProfile: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
  },
};

describe('UsersService — Unit', () => {
  let service: UsersService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UsersService(mockPrisma as any, mockLoggerValue as any);
  });

  // ─── create ──────────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('should hash the password and create the user', async () => {
      mockPrisma.user.create.mockResolvedValue(mockUser);

      const result = await service.create({ email: mockUser.email, password: 'plaintext' });

      expect(result.email).toBe(mockUser.email);
      const callData = mockPrisma.user.create.mock.calls[0][0].data;
      expect(callData.passwordHash).not.toBe('plaintext');
      expect(callData.passwordHash).toMatch(/^\$2[ab]\$/); // bcrypt hash
    });
  });

  // ─── findByEmail ─────────────────────────────────────────────────────────────

  describe('findByEmail()', () => {
    it('should return the user when found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findByEmail(mockUser.email);

      expect(result).toEqual(mockUser);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: mockUser.email } })
      );
    });

    it('should return null when user is not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.findByEmail('unknown@test.com');

      expect(result).toBeNull();
    });
  });

  // ─── findById ────────────────────────────────────────────────────────────────

  describe('findById()', () => {
    it('should return the user when found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findById(USER_ID);

      expect(result).toEqual(mockUser);
    });

    it('should return null when user is not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  // ─── getProfile ───────────────────────────────────────────────────────────────

  describe('getProfile()', () => {
    it('should return the user with their profile', async () => {
      const userWithProfile = { ...mockUser, profile: mockProfile };
      mockPrisma.user.findUnique.mockResolvedValue(userWithProfile);

      const result = await service.getProfile(USER_ID);

      expect(result.profile).toEqual(mockProfile);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: USER_ID } })
      );
    });

    it('should throw NotFoundException (not a plain Error) when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getProfile('non-existent')).rejects.toThrow(NotFoundException);
    });

    it('regression: getProfile must throw NotFoundException, not Error (would be 500 otherwise)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const error = await service.getProfile(USER_ID).catch((e) => e);

      // GoldenRuleExceptionFilter only handles HttpException; a plain Error → 500
      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.getStatus()).toBe(404);
    });
  });

  // ─── updateProfile ────────────────────────────────────────────────────────────

  describe('updateProfile()', () => {
    const dto = { displayName: 'Sophie Dupont', city: 'Lyon' };

    it('should upsert the profile and return the updated user', async () => {
      const userWithProfile = { ...mockUser, profile: { ...mockProfile, ...dto } };
      // First call: user existence check; second call: return updated user
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(userWithProfile);
      mockPrisma.freelancerProfile.upsert.mockResolvedValue({});

      const result = await service.updateProfile(USER_ID, dto as any);

      expect(mockPrisma.freelancerProfile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER_ID },
          update: dto,
          create: { ...dto, user: { connect: { id: USER_ID } } },
        })
      );
      expect(result.profile?.displayName).toBe('Sophie Dupont');
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.updateProfile('non-existent', dto as any)).rejects.toThrow(
        NotFoundException
      );
      expect(mockPrisma.freelancerProfile.upsert).not.toHaveBeenCalled();
    });
  });

  // ─── getLogoStream ───────────────────────────────────────────────────────────

  describe('getLogoStream()', () => {
    beforeEach(() => {
      (fs.existsSync as jest.Mock).mockImplementation(realFsExistsSync);
      (fs.createReadStream as jest.Mock).mockImplementation(realFsCreateReadStream);
    });

    it('should throw NotFoundException when profile has no logo', async () => {
      mockPrisma.freelancerProfile.findUnique.mockResolvedValue({ logoStorageKey: null });

      await expect(service.getLogoStream(USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when storage key does not match user id', async () => {
      mockPrisma.freelancerProfile.findUnique.mockResolvedValue({
        logoStorageKey: 'logos/other-user.png',
      });

      await expect(service.getLogoStream(USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when file is missing on disk', async () => {
      mockPrisma.freelancerProfile.findUnique.mockResolvedValue({
        logoStorageKey: `logos/${USER_ID}.png`,
      });
      (fs.existsSync as jest.Mock).mockReturnValueOnce(false);

      await expect(service.getLogoStream(USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('should return a read stream when logo exists', async () => {
      mockPrisma.freelancerProfile.findUnique.mockResolvedValue({
        logoStorageKey: `logos/${USER_ID}.png`,
      });
      (fs.existsSync as jest.Mock).mockReturnValueOnce(true);
      const fakeStream = { pipe: jest.fn() };
      (fs.createReadStream as jest.Mock).mockReturnValueOnce(
        fakeStream as unknown as ReturnType<typeof fs.createReadStream>
      );

      const result = await service.getLogoStream(USER_ID);

      expect(result.mimeType).toBe('image/png');
      expect(result.stream).toBe(fakeStream);
      expect(fs.createReadStream).toHaveBeenCalled();
    });
  });
});
