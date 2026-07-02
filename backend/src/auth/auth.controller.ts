import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthService, TokenPair } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { AppException } from '../common/exceptions/app.exception';
import { UsersService } from '../users/users.service';

@Controller('auth')
export class AuthController {
  private readonly refreshCookieName: string;

  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
  ) {
    this.refreshCookieName = this.config.get<string>(
      'REFRESH_COOKIE_NAME',
      'refresh_token',
    );
  }

  private setRefreshCookie(res: Response, tokens: TokenPair) {
    res.cookie(this.refreshCookieName, tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/auth',
      expires: tokens.refreshExpiresAt,
    });
  }

  private clearRefreshCookie(res: Response) {
    res.clearCookie(this.refreshCookieName, { path: '/auth' });
  }

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.register(dto);
    this.setRefreshCookie(res, tokens);
    return { accessToken: tokens.accessToken, user: tokens.user };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.login(dto);
    this.setRefreshCookie(res, tokens);
    return { accessToken: tokens.accessToken, user: tokens.user };
  }

  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { userId, rawToken } = req.user as {
      userId: number;
      rawToken: string;
    };
    const tokens = await this.authService.rotateRefreshToken(userId, rawToken);
    this.setRefreshCookie(res, tokens);
    return { accessToken: tokens.accessToken, user: tokens.user };
  }

  @UseGuards(JwtRefreshGuard)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { userId, rawToken } = req.user as {
      userId: number;
      rawToken: string;
    };
    await this.authService.revokeRefreshToken(userId, rawToken);
    this.clearRefreshCookie(res);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: { userId: number }) {
    const found = await this.usersService.findById(user.userId);
    if (!found) {
      throw new AppException('AUTH.UNAUTHORIZED', HttpStatus.UNAUTHORIZED);
    }
    return this.usersService.toPublic(found);
  }
}
