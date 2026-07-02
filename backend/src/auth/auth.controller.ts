import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { User } from '@prisma/client';
import type { CookieOptions, Request, Response } from 'express';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';

const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
};

@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('request-link')
  async requestLink(@Body() body: { email?: string }) {
    if (!body?.email?.trim()) {
      throw new BadRequestException('email is required');
    }
    return this.auth.requestLink(body.email);
  }

  @Get('verify')
  async verify(
    @Query('token') token: string,
    @Headers('accept') accept: string | undefined,
    @Res() res: Response,
  ) {
    const session = await this.auth.claimMagicLink(token);
    if (!session) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    res.cookie('sid', session.token, {
      ...baseCookieOptions,
      secure: this.config.get<boolean>('auth.secureCookies') ?? false,
      expires: session.expiresAt,
    });
    if (accept?.includes('text/html')) {
      res.redirect(302, '/');
      return;
    }
    res.status(200).json({ ok: true });
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookies = req.cookies as Record<string, string> | undefined;
    const sid = cookies?.sid;
    if (sid) {
      await this.auth.logout(sid);
    }
    res.cookie('sid', '', {
      ...baseCookieOptions,
      secure: this.config.get<boolean>('auth.secureCookies') ?? false,
      maxAge: 0,
    });
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: User) {
    return {
      id: user.id,
      email: user.email,
      tgChatId: user.tgChatId,
      tgUserId: user.tgUserId,
      createdAt: user.createdAt,
    };
  }
}
