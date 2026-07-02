import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { Strategy } from 'passport-jwt';

export interface RefreshTokenPayload {
  sub: number;
  jti: string;
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  private readonly cookieName: string;

  constructor(config: ConfigService) {
    const cookieName = config.get<string>(
      'REFRESH_COOKIE_NAME',
      'refresh_token',
    );
    super({
      jwtFromRequest: (req: Request) =>
        (req?.cookies?.[cookieName] as string | undefined) ?? null,
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      passReqToCallback: true as const,
    });
    this.cookieName = cookieName;
  }

  validate(req: Request, payload: RefreshTokenPayload) {
    const rawToken = req.cookies[this.cookieName] as string;
    return { userId: payload.sub, jti: payload.jti, rawToken };
  }
}
