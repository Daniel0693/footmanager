import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AccessTokenPayload } from '../strategies/jwt.strategy';

export interface AuthenticatedRequest extends Request {
  user: { userId: AccessTokenPayload['sub'] };
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  },
);
