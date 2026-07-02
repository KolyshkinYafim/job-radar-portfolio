import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { User } from '@prisma/client';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { getOwnerUserId } from './current-user.helper';

@Injectable()
export class OwnerGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: User }>();
    const cookies = req.cookies as Record<string, string> | undefined;
    const sid = cookies?.sid;
    if (!sid) {
      throw new UnauthorizedException('No session cookie');
    }
    const user = await this.auth.getUserBySession(sid);
    if (!user) {
      throw new UnauthorizedException('Invalid or expired session');
    }
    if (user.id !== getOwnerUserId(this.config)) {
      throw new ForbiddenException('Owner-only endpoint');
    }
    req.user = user;
    return true;
  }
}
