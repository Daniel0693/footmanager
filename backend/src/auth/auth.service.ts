import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'crypto';
import type { JwtPayload, SignOptions } from 'jsonwebtoken';
import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { PublicUser, UsersService } from '../users/users.service';

const BCRYPT_ROUNDS = 12;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: PublicUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  private async issueTokenPair(
    userId: number,
    user: PublicUser,
  ): Promise<TokenPair> {
    const accessToken = this.jwtService.sign(
      { sub: userId },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        // Cast : la valeur vient d'une env var (string libre), jsonwebtoken
        // exige un literal-type StringValue que le compilateur ne peut pas
        // vérifier statiquement ici.
        expiresIn: this.config.get<string>(
          'JWT_ACCESS_EXPIRES_IN',
          '15m',
        ) as SignOptions['expiresIn'],
      },
    );

    const jti = randomUUID();
    const refreshToken = this.jwtService.sign(
      { sub: userId, jti },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get<string>(
          'JWT_REFRESH_EXPIRES_IN',
          '30d',
        ) as SignOptions['expiresIn'],
      },
    );

    const decoded = this.jwtService.decode<JwtPayload>(refreshToken);
    // `exp` est garanti présent : on vient de signer ce token nous-mêmes avec `expiresIn`.
    const refreshExpiresAt = new Date(decoded.exp! * 1000);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: refreshExpiresAt,
      },
    });

    return { accessToken, refreshToken, refreshExpiresAt, user };
  }

  async register(dto: {
    email: string;
    password: string;
    locale?: string;
  }): Promise<TokenPair> {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new AppException('AUTH.EMAIL_TAKEN', HttpStatus.CONFLICT);
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.usersService.create({
      email: dto.email,
      passwordHash,
      locale: dto.locale,
    });

    return this.issueTokenPair(user.id, this.usersService.toPublic(user));
  }

  async login(dto: { email: string; password: string }): Promise<TokenPair> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new AppException(
        'AUTH.INVALID_CREDENTIALS',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw new AppException(
        'AUTH.INVALID_CREDENTIALS',
        HttpStatus.UNAUTHORIZED,
      );
    }

    return this.issueTokenPair(user.id, this.usersService.toPublic(user));
  }

  async rotateRefreshToken(
    userId: number,
    rawToken: string,
  ): Promise<TokenPair> {
    const tokenHash = this.hashToken(rawToken);
    const existing = await this.prisma.refreshToken.findFirst({
      where: { userId, tokenHash },
    });

    if (!existing || existing.revokedAt || existing.expiresAt < new Date()) {
      throw new AppException(
        'AUTH.REFRESH_TOKEN_INVALID',
        HttpStatus.UNAUTHORIZED,
      );
    }

    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new AppException(
        'AUTH.REFRESH_TOKEN_INVALID',
        HttpStatus.UNAUTHORIZED,
      );
    }

    return this.issueTokenPair(user.id, this.usersService.toPublic(user));
  }

  async revokeRefreshToken(userId: number, rawToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    await this.prisma.refreshToken.updateMany({
      where: { userId, tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
