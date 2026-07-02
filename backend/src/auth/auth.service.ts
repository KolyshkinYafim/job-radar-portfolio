import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Session, User } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly whitelist: ReadonlySet<string>;
  private readonly sessionTtlMs: number;
  private readonly exposeLinkInResponse: boolean;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const owner = this.normalize(
      config.get<string>('auth.ownerEmail') ?? 'owner@local',
    );
    const beta = (config.get<string>('auth.betaEmails') ?? '')
      .split(',')
      .map((e) => this.normalize(e))
      .filter(Boolean);
    this.whitelist = new Set([owner, ...beta]);
    const ttlMinutes = config.get<number>('auth.sessionTtlMinutes') ?? 30;
    this.sessionTtlMs = ttlMinutes * 60 * 1000;
    this.exposeLinkInResponse =
      config.get<boolean>('auth.exposeLinkInResponse') ?? true;
  }

  private normalize(email: string): string {
    return email.trim().toLowerCase();
  }

  isWhitelisted(email: string): boolean {
    return this.whitelist.has(this.normalize(email));
  }

  async requestLink(email: string): Promise<{ sent: true; link?: string }> {
    const normalized = this.normalize(email);
    if (!this.isWhitelisted(normalized)) {
      throw new ForbiddenException('Email not in beta whitelist');
    }
    const user = await this.prisma.user.upsert({
      where: { email: normalized },
      create: { email: normalized },
      update: {},
    });
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + this.sessionTtlMs);
    await this.prisma.session.create({
      data: { userId: user.id, token, expiresAt },
    });
    const link = `/api/auth/verify?token=${token}`;
    this.logger.log(`Magic link for ${normalized}: ${link}`);
    return this.exposeLinkInResponse ? { sent: true, link } : { sent: true };
  }

  async claimMagicLink(
    token: string,
  ): Promise<(Session & { user: User }) | null> {
    if (!token) return null;
    const result = await this.prisma.session.updateMany({
      where: { token, claimedAt: null, expiresAt: { gt: new Date() } },
      data: { claimedAt: new Date() },
    });
    if (result.count === 0) return null;
    return this.prisma.session.findUnique({
      where: { token },
      include: { user: true },
    });
  }

  async validateSession(
    token: string,
  ): Promise<(Session & { user: User }) | null> {
    if (!token) return null;
    const session = await this.prisma.session.findUnique({
      where: { token },
      include: { user: true },
    });
    if (!session) return null;
    if (session.expiresAt.getTime() <= Date.now()) return null;
    if (!session.claimedAt) return null;
    return session;
  }

  async getUserBySession(token: string): Promise<User | null> {
    const session = await this.validateSession(token);
    return session?.user ?? null;
  }

  async logout(token: string): Promise<void> {
    if (!token) return;
    try {
      await this.prisma.session.delete({ where: { token } });
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2025') {
        throw err;
      }
    }
  }
}
