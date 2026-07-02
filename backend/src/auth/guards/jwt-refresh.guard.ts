import { HttpStatus, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AppException } from '../../common/exceptions/app.exception';

@Injectable()
export class JwtRefreshGuard extends AuthGuard('jwt-refresh') {
  handleRequest<TUser = any>(err: unknown, user: TUser): TUser {
    if (err || !user) {
      throw new AppException(
        'AUTH.REFRESH_TOKEN_INVALID',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return user;
  }
}
