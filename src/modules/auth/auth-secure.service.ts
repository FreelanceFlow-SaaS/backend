import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { compare, hash } from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { User } from '../users/user.entity';

export interface TokenPayload {
  sub: string;
  email: string;
  type: 'access' | 'refresh';
}

export interface AuthResponse {
  user: Partial<User>;
  accessToken?: string; // Only for testing - removed in production
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private generateTokens(user: User) {
    const payload: Omit<TokenPayload, 'type'> = { 
      email: user.email, 
      sub: user.id 
    };

    const accessToken = this.jwtService.sign(
      { ...payload, type: 'access' },
      { expiresIn: this.configService.get('JWT_ACCESS_EXPIRES_IN', '15m') }
    );

    const refreshToken = this.jwtService.sign(
      { ...payload, type: 'refresh' },
      { expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d') }
    );

    return { accessToken, refreshToken };
  }

  private setTokenCookies(response: Response, accessToken: string, refreshToken: string) {
    const isProduction = this.configService.get('NODE_ENV') === 'production';

    // Set refresh token as HttpOnly cookie (most secure)
    response.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: isProduction, // HTTPS only in production
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/api/v1/auth', // Restrict to auth endpoints
    });

    // Set access token as HttpOnly cookie
    response.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict', 
      maxAge: 15 * 60 * 1000, // 15 minutes
      path: '/', // Available to all API endpoints
    });
  }

  async register(createUserDto: CreateUserDto, response: Response): Promise<AuthResponse> {
    // Check if user already exists
    const existingUser = await this.usersService.findByEmail(createUserDto.email);
    if (existingUser) {
      throw new ConflictException('Un utilisateur avec cet email existe déjà');
    }

    // Hash password
    const hashedPassword = await hash(createUserDto.password, 12);

    // Create user
    const user = await this.usersService.create({
      ...createUserDto,
      password: hashedPassword,
    });

    // Generate tokens
    const { accessToken, refreshToken } = this.generateTokens(user);

    // Set secure cookies
    this.setTokenCookies(response, accessToken, refreshToken);

    // Store refresh token hash in database for revocation
    await this.storeRefreshToken(user.id, refreshToken);

    return {
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
      },
      // Include access token in response for testing (remove in production)
      accessToken: this.configService.get('NODE_ENV') === 'development' ? accessToken : undefined,
    };
  }

  async login(loginDto: LoginDto, response: Response): Promise<AuthResponse> {
    // Find user by email
    const user = await this.usersService.findByEmail(loginDto.email);
    if (!user) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    // Verify password
    const isPasswordValid = await compare(loginDto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    // Generate new tokens
    const { accessToken, refreshToken } = this.generateTokens(user);

    // Set secure cookies
    this.setTokenCookies(response, accessToken, refreshToken);

    // Store new refresh token
    await this.storeRefreshToken(user.id, refreshToken);

    return {
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
      },
      accessToken: this.configService.get('NODE_ENV') === 'development' ? accessToken : undefined,
    };
  }

  async refreshTokens(refreshToken: string, response: Response): Promise<AuthResponse> {
    try {
      // Verify refresh token
      const payload = this.jwtService.verify(refreshToken) as TokenPayload;
      
      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Token invalide');
      }

      // Check if refresh token exists in database
      const storedToken = await this.prisma.refreshToken.findFirst({
        where: {
          userId: payload.sub,
          tokenHash: await hash(refreshToken, 10),
          expiresAt: {
            gt: new Date(),
          },
        },
      });

      if (!storedToken) {
        throw new UnauthorizedException('Token de rafraîchissement invalide ou expiré');
      }

      // Get user
      const user = await this.usersService.findById(payload.sub);
      if (!user) {
        throw new UnauthorizedException('Utilisateur introuvable');
      }

      // Generate new tokens
      const { accessToken, refreshToken: newRefreshToken } = this.generateTokens(user);

      // Set new cookies
      this.setTokenCookies(response, accessToken, newRefreshToken);

      // Replace old refresh token with new one
      await this.replaceRefreshToken(storedToken.id, user.id, newRefreshToken);

      return {
        user: {
          id: user.id,
          email: user.email,
          createdAt: user.createdAt,
        },
        accessToken: this.configService.get('NODE_ENV') === 'development' ? accessToken : undefined,
      };
    } catch (error) {
      throw new UnauthorizedException('Token de rafraîchissement invalide');
    }
  }

  async logout(userId: string, response: Response): Promise<void> {
    // Remove all refresh tokens for this user
    await this.prisma.refreshToken.deleteMany({
      where: { userId },
    });

    // Clear cookies
    response.clearCookie('accessToken');
    response.clearCookie('refreshToken', { path: '/api/v1/auth' });
  }

  async validateUser(userId: string): Promise<User | null> {
    return this.usersService.findById(userId);
  }

  private async storeRefreshToken(userId: string, refreshToken: string): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    const tokenHash = await hash(refreshToken, 10);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });
  }

  private async replaceRefreshToken(oldTokenId: string, userId: string, newRefreshToken: string): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const tokenHash = await hash(newRefreshToken, 10);

    await this.prisma.$transaction([
      this.prisma.refreshToken.delete({ where: { id: oldTokenId } }),
      this.prisma.refreshToken.create({
        data: {
          userId,
          tokenHash, 
          expiresAt,
        },
      }),
    ]);
  }
}