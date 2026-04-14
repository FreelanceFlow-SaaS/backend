import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { Request, Response } from 'express';

const mockRes = () => {
  const res: Partial<Response> = {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  };
  return res as Response;
};

const mockReq = (cookies: Record<string, string> = {}) =>
  ({ cookies, user: { id: 'user-uuid-123' } }) as unknown as Request;

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<Pick<AuthService, 'register' | 'login' | 'logout' | 'refresh'>>;

  beforeEach(async () => {
    authService = {
      register: jest.fn(),
      login: jest.fn(),
      logout: jest.fn(),
      refresh: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  // ─── refresh ─────────────────────────────────────────────────────────────────

  describe('refresh()', () => {
    it('should return new access_token when service succeeds', async () => {
      const req = mockReq({ refreshToken: 'valid-refresh-token' });
      const res = mockRes();
      (authService.refresh as jest.Mock).mockResolvedValue({ access_token: 'new-token' });

      const result = await controller.refresh(req, res);

      expect(authService.refresh).toHaveBeenCalledWith('valid-refresh-token', res);
      expect(result).toEqual({ access_token: 'new-token' });
      expect(res.clearCookie).not.toHaveBeenCalled();
    });

    it('should clear the cookie and throw UnauthorizedException when no cookie is present', async () => {
      const req = mockReq({}); // no refreshToken cookie
      const res = mockRes();

      await expect(controller.refresh(req, res)).rejects.toThrow(UnauthorizedException);
      expect(res.clearCookie).toHaveBeenCalledWith('refreshToken', expect.any(Object));
      expect(authService.refresh).not.toHaveBeenCalled();
    });

    it('should clear the cookie and re-throw when service throws (expired / invalid token)', async () => {
      const req = mockReq({ refreshToken: 'expired-token' });
      const res = mockRes();
      const serviceError = new UnauthorizedException('Token de rafraîchissement invalide');
      (authService.refresh as jest.Mock).mockRejectedValue(serviceError);

      await expect(controller.refresh(req, res)).rejects.toThrow(UnauthorizedException);
      expect(res.clearCookie).toHaveBeenCalledWith('refreshToken', expect.any(Object));
    });
  });

  // ─── logout ──────────────────────────────────────────────────────────────────

  describe('logout()', () => {
    it('should delegate to authService.logout with userId and refreshToken from request', async () => {
      const req = mockReq({ refreshToken: 'some-token' });
      const res = mockRes();
      (authService.logout as jest.Mock).mockResolvedValue({ message: 'Déconnexion réussie' });

      const result = await controller.logout(req, res);

      expect(authService.logout).toHaveBeenCalledWith('user-uuid-123', 'some-token', res);
      expect(result).toEqual({ message: 'Déconnexion réussie' });
    });
  });
});
