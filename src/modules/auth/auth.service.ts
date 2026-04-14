import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { compare, hash } from 'bcryptjs';
import { Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { UsersService } from '../users/users.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { User } from '../users/user.entity';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @InjectPinoLogger(AuthService.name)
    private readonly logger: PinoLogger
  ) {}

  /** Convert a jwt-style duration string (e.g. '30m', '7d') to milliseconds. */
  private parseDurationMs(duration: string): number {
    const match = /^(\d+)([smhd])$/.exec(duration);
    if (!match) throw new Error(`Invalid duration format: ${duration}`);
    const value = parseInt(match[1], 10);
    const multipliers: Record<string, number> = {
      s: 1_000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };
    return value * multipliers[match[2]];
  }

  async register(
    createUserDto: CreateUserDto
  ): Promise<{ access_token: string; user: Partial<User> }> {
    // Check if user already exists
    const existingUser = await this.usersService.findByEmail(createUserDto.email);
    if (existingUser) {
      throw new ConflictException('Un utilisateur avec cet email existe déjà');
    }

    // Create user (UsersService.create handles password hashing)
    const user = await this.usersService.create(createUserDto);

    this.logger.info({ event: 'user_register_success', userId: user.id }, 'user registered');

    // Generate JWT
    const payload = { email: user.email, sub: user.id };
    const accessExpiry = this.config.get<string>('JWT_ACCESS_EXPIRES_IN', '30m');
    const access_token = this.jwtService.sign(payload, { expiresIn: accessExpiry as any });

    return {
      access_token,
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
      },
    };
  }

  async login(
    loginDto: LoginDto,
    res: Response
  ): Promise<{ access_token: string; user: Partial<User> }> {
    // Find user by email
    const user = await this.usersService.findByEmail(loginDto.email);
    if (!user) {
      this.logger.warn({ event: 'user_login_failure', reason: 'user_not_found' }, 'login failed');
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    // Verify password
    const isPasswordValid = await compare(loginDto.password, user.passwordHash);
    if (!isPasswordValid) {
      this.logger.warn(
        { event: 'user_login_failure', userId: user.id, reason: 'wrong_password' },
        'login failed'
      );
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    // Generate access token
    const accessExpiry = this.config.get<string>('JWT_ACCESS_EXPIRES_IN', '30m');
    const payload = { email: user.email, sub: user.id };
    const access_token = this.jwtService.sign(payload, { expiresIn: accessExpiry as any });

    // Generate refresh token
    const refreshExpiry = this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '30d');
    const refreshExpireMs = this.parseDurationMs(refreshExpiry);
    const refreshToken = this.jwtService.sign(
      { sub: user.id },
      { expiresIn: refreshExpiry as any }
    );
    const refreshTokenHash = await hash(refreshToken, 10);

    // Store refresh token in database
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: refreshTokenHash,
        expiresAt: new Date(Date.now() + refreshExpireMs),
      },
    });

    this.logger.info({ event: 'user_login_success', userId: user.id }, 'user logged in');

    // Set refresh token as HttpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: refreshExpireMs,
    });

    return {
      access_token,
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
      },
    };
  }

  async logout(userId: string, refreshToken: string, res: Response): Promise<{ message: string }> {
    if (!refreshToken || !userId) {
      throw new UnauthorizedException('Session invalide');
    }

    try {
      // Verify refresh token
      const decoded = this.jwtService.verify(refreshToken);

      if (decoded.sub !== userId) {
        throw new UnauthorizedException('Token invalide');
      }

      // Remove all refresh tokens for this user from database
      await this.prisma.refreshToken.deleteMany({
        where: { userId },
      });

      // Clear refresh token cookie
      res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
      });

      this.logger.info({ event: 'user_logout', userId }, 'user logged out');
      return { message: 'Déconnexion réussie' };
    } catch (error) {
      // Clear cookie anyway in case of invalid token
      res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
      });

      return { message: 'Déconnexion réussie' };
    }
  }

  async refresh(refreshToken: string, res: Response): Promise<{ access_token: string }> {
    if (!refreshToken) {
      throw new UnauthorizedException('Token de rafraîchissement manquant');
    }

    try {
      // Verify refresh token
      const decoded = this.jwtService.verify(refreshToken);
      const userId = decoded.sub;

      // Check if token exists in database
      const storedTokens = await this.prisma.refreshToken.findMany({
        where: {
          userId,
          expiresAt: { gt: new Date() },
        },
      });

      // Verify token hash matches one in database
      let validToken = false;
      for (const storedToken of storedTokens) {
        if (await compare(refreshToken, storedToken.tokenHash)) {
          validToken = true;
          break;
        }
      }

      if (!validToken) {
        throw new UnauthorizedException('Token de rafraîchissement invalide');
      }

      // Get user
      const user = await this.usersService.findById(userId);
      if (!user) {
        throw new UnauthorizedException('Utilisateur non trouvé');
      }

      // Generate new access token
      const accessExpiry = this.config.get<string>('JWT_ACCESS_EXPIRES_IN', '30m');
      const payload = { email: user.email, sub: user.id };
      const access_token = this.jwtService.sign(payload, { expiresIn: accessExpiry as any });

      // Generate new refresh token (rotation)
      const refreshExpiry = this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '30d');
      const refreshExpireMs = this.parseDurationMs(refreshExpiry);
      const newRefreshToken = this.jwtService.sign(
        { sub: user.id },
        { expiresIn: refreshExpiry as any }
      );
      const newRefreshTokenHash = await hash(newRefreshToken, 10);

      // Replace old refresh token with new one
      await this.prisma.refreshToken.deleteMany({ where: { userId } });
      await this.prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: newRefreshTokenHash,
          expiresAt: new Date(Date.now() + refreshExpireMs),
        },
      });

      this.logger.info({ event: 'token_refresh', userId }, 'token refreshed');

      // Set new refresh token cookie
      res.cookie('refreshToken', newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: refreshExpireMs,
      });

      return { access_token };
    } catch (error) {
      throw new UnauthorizedException('Token de rafraîchissement invalide');
    }
  }

  async validateUser(userId: string): Promise<User | null> {
    return this.usersService.findById(userId);
  }
}
