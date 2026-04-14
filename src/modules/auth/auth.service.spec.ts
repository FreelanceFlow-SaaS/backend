import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { mockLoggerProvider } from '../../common/testing/mock-logger';
import { Response } from 'express';

// Mock bcryptjs so tests run without real hashing (fast + deterministic)
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed-value'),
  compare: jest.fn().mockResolvedValue(true),
}));

import { compare } from 'bcryptjs';

const mockUser = {
  id: 'user-uuid-123',
  email: 'sophie@example.com',
  passwordHash: 'hashed-password',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

const mockRes = {
  cookie: jest.fn(),
  clearCookie: jest.fn(),
} as unknown as Response;

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<Pick<UsersService, 'findByEmail' | 'create' | 'findById'>>;
  let jwtService: jest.Mocked<Pick<JwtService, 'sign' | 'verify'>>;
  let prisma: { refreshToken: Record<string, jest.Mock> };

  beforeEach(async () => {
    usersService = {
      findByEmail: jest.fn(),
      create: jest.fn(),
      findById: jest.fn(),
    };

    jwtService = {
      sign: jest.fn().mockReturnValue('mock-access-token'),
      verify: jest.fn().mockReturnValue({ sub: mockUser.id, email: mockUser.email }),
    };

    prisma = {
      refreshToken: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({}),
      },
    };

    const mockConfigService = {
      get: jest.fn((key: string, defaultVal?: string) => {
        const config: Record<string, string> = {
          JWT_ACCESS_EXPIRES_IN: '30m',
          JWT_REFRESH_EXPIRES_IN: '30d',
        };
        return config[key] ?? defaultVal;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PrismaService, useValue: prisma },
        mockLoggerProvider(AuthService.name),
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();

    // Re-apply default mocks after clearAllMocks
    (jwtService.sign as jest.Mock).mockReturnValue('mock-access-token');
    (jwtService.verify as jest.Mock).mockReturnValue({ sub: mockUser.id, email: mockUser.email });
    (prisma.refreshToken.create as jest.Mock).mockResolvedValue({});
    (prisma.refreshToken.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.refreshToken.deleteMany as jest.Mock).mockResolvedValue({});
    (compare as jest.Mock).mockResolvedValue(true);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── register ────────────────────────────────────────────────────────────────

  describe('register()', () => {
    it('should create a user and return access_token + safe user object', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue(mockUser as any);

      const result = await service.register({ email: mockUser.email, password: 'password123' });

      expect(usersService.findByEmail).toHaveBeenCalledWith(mockUser.email);
      expect(usersService.create).toHaveBeenCalled();
      expect(result.access_token).toBe('mock-access-token');
      expect(result.user.id).toBe(mockUser.id);
      expect(result.user.email).toBe(mockUser.email);
      expect((result.user as any).passwordHash).toBeUndefined();
    });

    it('regression: must NOT pre-hash the password before calling usersService.create (double-hash bug)', async () => {
      // If AuthService hashes the password itself before calling usersService.create(),
      // the password gets hashed twice and login will always return 401.
      // bcryptjs.hash mock returns 'hashed-value', so if create() receives 'hashed-value'
      // it means AuthService incorrectly hashed it before delegating to UsersService.
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue(mockUser as any);

      await service.register({ email: mockUser.email, password: 'password123' });

      expect(usersService.create).toHaveBeenCalledWith({
        email: mockUser.email,
        password: 'password123', // plain password — hashing is UsersService's responsibility
      });
    });

    it('should throw ConflictException when email is already taken', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser as any);

      await expect(
        service.register({ email: mockUser.email, password: 'password123' })
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── login ───────────────────────────────────────────────────────────────────

  describe('login()', () => {
    it('should return access_token, store refresh token hash, and set cookie', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser as any);
      (compare as jest.Mock).mockResolvedValue(true);
      // sign called twice: access token then refresh token
      (jwtService.sign as jest.Mock)
        .mockReturnValueOnce('mock-access-token')
        .mockReturnValueOnce('mock-refresh-token');

      const result = await service.login(
        { email: mockUser.email, password: 'password123' },
        mockRes
      );

      expect(result.access_token).toBe('mock-access-token');
      expect(result.user.email).toBe(mockUser.email);
      expect(prisma.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: mockUser.id }) })
      );
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'mock-refresh-token',
        expect.any(Object)
      );
    });

    it('should throw UnauthorizedException when user does not exist', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: 'unknown@example.com', password: 'password123' }, mockRes)
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when password is wrong', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser as any);
      (compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ email: mockUser.email, password: 'wrong-password' }, mockRes)
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should use the same error message for wrong email and wrong password (prevents user enumeration)', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      await expect(
        service.login({ email: 'ghost@example.com', password: 'any' }, mockRes)
      ).rejects.toThrow('Email ou mot de passe incorrect');

      usersService.findByEmail.mockResolvedValue(mockUser as any);
      (compare as jest.Mock).mockResolvedValue(false);
      await expect(
        service.login({ email: mockUser.email, password: 'wrong' }, mockRes)
      ).rejects.toThrow('Email ou mot de passe incorrect');
    });
  });

  // ─── logout ──────────────────────────────────────────────────────────────────

  describe('logout()', () => {
    it('should delete all user refresh tokens and clear cookie', async () => {
      const result = await service.logout(mockUser.id, 'valid-refresh-token', mockRes);

      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: mockUser.id },
      });
      expect(mockRes.clearCookie).toHaveBeenCalledWith('refreshToken', expect.any(Object));
      expect(result.message).toBe('Déconnexion réussie');
    });

    it('should throw UnauthorizedException when userId is missing', async () => {
      await expect(service.logout('', 'some-token', mockRes)).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('should throw UnauthorizedException when refreshToken is missing', async () => {
      await expect(service.logout(mockUser.id, '', mockRes)).rejects.toThrow(UnauthorizedException);
    });

    it('should still clear cookie and return success when token verification fails (graceful logout)', async () => {
      (jwtService.verify as jest.Mock).mockImplementation(() => {
        throw new Error('jwt expired');
      });

      const result = await service.logout(mockUser.id, 'expired-token', mockRes);

      expect(mockRes.clearCookie).toHaveBeenCalled();
      expect(result.message).toBe('Déconnexion réussie');
    });
  });

  // ─── refresh ─────────────────────────────────────────────────────────────────

  describe('refresh()', () => {
    const storedToken = { id: 'token-id', tokenHash: 'hashed-value', userId: mockUser.id };

    it('should return new access_token and rotate the refresh token', async () => {
      (jwtService.verify as jest.Mock).mockReturnValue({ sub: mockUser.id });
      (prisma.refreshToken.findMany as jest.Mock).mockResolvedValue([storedToken]);
      (compare as jest.Mock).mockResolvedValue(true);
      usersService.findById.mockResolvedValue(mockUser as any);
      (jwtService.sign as jest.Mock)
        .mockReturnValueOnce('new-access-token')
        .mockReturnValueOnce('new-refresh-token');

      const result = await service.refresh('old-refresh-token', mockRes);

      expect(result.access_token).toBe('new-access-token');
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: mockUser.id },
      });
      expect(prisma.refreshToken.create).toHaveBeenCalled();
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'new-refresh-token',
        expect.any(Object)
      );
    });

    it('should throw UnauthorizedException when token is missing', async () => {
      await expect(service.refresh('', mockRes)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when token is not found in DB', async () => {
      (jwtService.verify as jest.Mock).mockReturnValue({ sub: mockUser.id });
      (prisma.refreshToken.findMany as jest.Mock).mockResolvedValue([storedToken]);
      (compare as jest.Mock).mockResolvedValue(false); // hash does not match

      await expect(service.refresh('tampered-token', mockRes)).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('should throw UnauthorizedException when user no longer exists', async () => {
      (jwtService.verify as jest.Mock).mockReturnValue({ sub: mockUser.id });
      (prisma.refreshToken.findMany as jest.Mock).mockResolvedValue([storedToken]);
      (compare as jest.Mock).mockResolvedValue(true);
      usersService.findById.mockResolvedValue(null);

      await expect(service.refresh('valid-token', mockRes)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when JWT verification fails (expired/malformed)', async () => {
      (jwtService.verify as jest.Mock).mockImplementation(() => {
        throw new Error('jwt expired');
      });

      await expect(service.refresh('expired-token', mockRes)).rejects.toThrow(
        UnauthorizedException
      );
    });
  });

  // ─── validateUser ─────────────────────────────────────────────────────────────

  describe('validateUser()', () => {
    it('should return user when found', async () => {
      usersService.findById.mockResolvedValue(mockUser as any);
      const result = await service.validateUser(mockUser.id);
      expect(result).toEqual(mockUser);
    });

    it('should return null when user does not exist', async () => {
      usersService.findById.mockResolvedValue(null);
      const result = await service.validateUser('non-existent-id');
      expect(result).toBeNull();
    });
  });
});
