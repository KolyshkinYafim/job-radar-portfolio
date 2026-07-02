import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import type { Request } from 'express';
import { AuthService } from './auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

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
    req.user = user;
    return true;
  }
}
