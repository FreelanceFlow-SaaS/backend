import { Controller, Post, Body, HttpCode, HttpStatus, Res, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthService, AuthResponse } from './auth-secure.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LoginDto } from './dto/login.dto';

@ApiTags('Authentication (Secure)')
@Controller('auth-secure')
export class AuthSecureController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ 
    summary: 'Register with HttpOnly cookies',
    description: 'Register a new user and set secure HttpOnly cookies for authentication'
  })
  @ApiResponse({ status: 201, description: 'User registered successfully. Tokens set as HttpOnly cookies.' })
  @ApiResponse({ status: 409, description: 'User with this email already exists.' })
  async register(
    @Body() createUserDto: CreateUserDto,
    @Res({ passthrough: true }) response: Response
  ): Promise<AuthResponse> {
    return this.authService.register(createUserDto, response);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Login with HttpOnly cookies',
    description: 'Login and set secure HttpOnly cookies for authentication'
  })
  @ApiResponse({ status: 200, description: 'Login successful. Tokens set as HttpOnly cookies.' })
  @ApiResponse({ status: 401, description: 'Invalid credentials.' })
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response
  ): Promise<AuthResponse> {
    return this.authService.login(loginDto, response);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth()
  @ApiOperation({ 
    summary: 'Refresh access token',
    description: 'Use refresh token from HttpOnly cookie to get new access token'
  })
  @ApiResponse({ status: 200, description: 'Tokens refreshed successfully.' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token.' })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ): Promise<AuthResponse> {
    const refreshToken = request.cookies?.refreshToken;
    if (!refreshToken) {
      throw new UnauthorizedException('Token de rafraîchissement manquant');
    }

    return this.authService.refreshTokens(refreshToken, response);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth()
  @ApiOperation({ 
    summary: 'Logout and clear cookies',
    description: 'Logout user and clear all authentication cookies'
  })
  @ApiResponse({ status: 200, description: 'Logged out successfully.' })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ): Promise<{ message: string }> {
    const userId = request.user?.id; // Will be set by auth guard
    if (userId) {
      await this.authService.logout(userId, response);
    }

    return { message: 'Déconnexion réussie' };
  }
}