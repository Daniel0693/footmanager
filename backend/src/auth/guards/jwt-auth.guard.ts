import { HttpStatus, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AppException } from '../../common/exceptions/app.exception';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = any>(err: unknown, user: TUser): TUser {
    if (err || !user) {
      throw new AppException('AUTH.UNAUTHORIZED', HttpStatus.UNAUTHORIZED);
    }
    return user;
  }
}
