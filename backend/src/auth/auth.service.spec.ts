import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

const mockPrisma = {
  user: { upsert: jest.fn() },
  session: {
    create: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  },
};

const buildConfig = (overrides: Record<string, unknown> = {}) => {
  const values: Record<string, unknown> = {
    'auth.ownerEmail': 'owner@local',
    'auth.betaEmails': 'alice@beta.io, bob@beta.io',
    'auth.sessionTtlMinutes': 30,
    ...overrides,
  };
  return { get: jest.fn((key: string) => values[key]) };
};

async function buildService(
  configOverrides: Record<string, unknown> = {},
): Promise<AuthService> {
  jest.clearAllMocks();
  const module = await Test.createTestingModule({
    providers: [
      AuthService,
      { provide: PrismaService, useValue: mockPrisma },
      { provide: ConfigService, useValue: buildConfig(configOverrides) },
    ],
  }).compile();
  return module.get(AuthService);
}

const futureSession = (overrides: Record<string, unknown> = {}) => ({
  id: 's1',
  token: 'tok',
  userId: 'u1',
  expiresAt: new Date(Date.now() + 60_000),
  claimedAt: new Date(),
  user: { id: 'u1', email: 'alice@beta.io' },
  ...overrides,
});

describe('AuthService', () => {
  describe('requestLink', () => {
    it('whitelisted: upserts user and creates session with ~30 min TTL', async () => {
      const service = await buildService();
      mockPrisma.user.upsert.mockResolvedValue({
        id: 'u1',
        email: 'alice@beta.io',
      });
      mockPrisma.session.create.mockResolvedValue({});

      const before = Date.now();
      const result = await service.requestLink('Alice@Beta.IO');

      expect(mockPrisma.user.upsert).toHaveBeenCalledWith({
        where: { email: 'alice@beta.io' },
        create: { email: 'alice@beta.io' },
        update: {},
      });
      const sessionCall = mockPrisma.session.create.mock.calls[0][0] as {
        data: { userId: string; token: string; expiresAt: Date };
      };
      expect(sessionCall.data.userId).toBe('u1');
      expect(sessionCall.data.token).toMatch(/^[0-9a-f]{64}$/);
      const ttlMs = sessionCall.data.expiresAt.getTime() - before;
      expect(ttlMs).toBeLessThanOrEqual(30 * 60 * 1000 + 50);
      expect(ttlMs).toBeGreaterThan(29 * 60 * 1000);
      expect(result.link).toBe(
        `/api/auth/verify?token=${sessionCall.data.token}`,
      );
    });

    it('non-whitelisted: throws ForbiddenException, no DB writes', async () => {
      const service = await buildService();
      await expect(service.requestLink('stranger@example.com')).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPrisma.user.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.session.create).not.toHaveBeenCalled();
    });

    it('owner is whitelisted even when BETA_EMAILS is empty', async () => {
      const service = await buildService({ 'auth.betaEmails': '' });
      mockPrisma.user.upsert.mockResolvedValue({
        id: 'owner',
        email: 'owner@local',
      });
      mockPrisma.session.create.mockResolvedValue({});
      await expect(service.requestLink('owner@local')).resolves.toMatchObject({
        link: expect.stringContaining('/api/auth/verify?token='),
      });
    });

    it('capitalization and whitespace are ignored', async () => {
      const service = await buildService();
      mockPrisma.user.upsert.mockResolvedValue({
        id: 'u',
        email: 'alice@beta.io',
      });
      mockPrisma.session.create.mockResolvedValue({});
      await service.requestLink('  ALICE@BETA.IO  ');
      expect(mockPrisma.user.upsert.mock.calls[0][0].where.email).toBe(
        'alice@beta.io',
      );
    });

    it('does not leak the token in the response when exposeLinkInResponse is off', async () => {
      const service = await buildService({
        'auth.exposeLinkInResponse': false,
      });
      mockPrisma.user.upsert.mockResolvedValue({
        id: 'u1',
        email: 'alice@beta.io',
      });
      mockPrisma.session.create.mockResolvedValue({});

      const result = await service.requestLink('alice@beta.io');

      expect(result).toEqual({ sent: true });
      expect((result as { link?: string }).link).toBeUndefined();
      expect(mockPrisma.session.create).toHaveBeenCalled();
    });
  });

  describe('claimMagicLink', () => {
    it('first claim: returns session+user when token is valid and unclaimed', async () => {
      const service = await buildService();
      mockPrisma.session.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.session.findUnique.mockResolvedValue(futureSession());

      const got = await service.claimMagicLink('tok');
      expect(got).not.toBeNull();
      expect(got?.user.id).toBe('u1');
      expect(mockPrisma.session.updateMany).toHaveBeenCalledWith({
        where: {
          token: 'tok',
          claimedAt: null,
          expiresAt: { gt: expect.any(Date) },
        },
        data: { claimedAt: expect.any(Date) },
      });
    });

    it('second claim (already claimed): returns null without findUnique', async () => {
      const service = await buildService();
      mockPrisma.session.updateMany.mockResolvedValue({ count: 0 });

      const got = await service.claimMagicLink('tok');
      expect(got).toBeNull();
      expect(mockPrisma.session.findUnique).not.toHaveBeenCalled();
    });

    it('concurrent: exactly one of two simultaneous claims succeeds', async () => {
      const service = await buildService();
      let claimed = false;
      mockPrisma.session.updateMany.mockImplementation(async () => {
        if (!claimed) {
          claimed = true;
          return { count: 1 };
        }
        return { count: 0 };
      });
      mockPrisma.session.findUnique.mockResolvedValue(futureSession());

      const [r1, r2] = await Promise.all([
        service.claimMagicLink('tok'),
        service.claimMagicLink('tok'),
      ]);

      const wins = [r1, r2].filter(Boolean);
      expect(wins).toHaveLength(1);
      expect(mockPrisma.session.findUnique).toHaveBeenCalledTimes(1);
    });

    it('expired token: updateMany returns count 0 → null', async () => {
      const service = await buildService();
      mockPrisma.session.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.claimMagicLink('expired-tok')).resolves.toBeNull();
    });

    it('non-existent token: updateMany returns count 0 → null', async () => {
      const service = await buildService();
      mockPrisma.session.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.claimMagicLink('no-such-tok')).resolves.toBeNull();
    });

    it('empty token: returns null without hitting DB', async () => {
      const service = await buildService();
      await expect(service.claimMagicLink('')).resolves.toBeNull();
      expect(mockPrisma.session.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('validateSession', () => {
    it('claimed, valid session: returns session+user', async () => {
      const service = await buildService();
      mockPrisma.session.findUnique.mockResolvedValue(futureSession());

      const got = await service.validateSession('tok');
      expect(got).not.toBeNull();
      expect(got?.user.id).toBe('u1');
    });

    it('not-claimed session (claimedAt null): returns null', async () => {
      const service = await buildService();
      mockPrisma.session.findUnique.mockResolvedValue(
        futureSession({ claimedAt: null }),
      );

      await expect(service.validateSession('tok')).resolves.toBeNull();
    });

    it('expired session: returns null', async () => {
      const service = await buildService();
      mockPrisma.session.findUnique.mockResolvedValue(
        futureSession({ expiresAt: new Date(Date.now() - 60_000) }),
      );

      await expect(service.validateSession('tok')).resolves.toBeNull();
    });

    it('non-existent session: returns null', async () => {
      const service = await buildService();
      mockPrisma.session.findUnique.mockResolvedValue(null);

      await expect(service.validateSession('no-such')).resolves.toBeNull();
    });

    it('empty token: returns null without hitting DB', async () => {
      const service = await buildService();
      await expect(service.validateSession('')).resolves.toBeNull();
      expect(mockPrisma.session.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('getUserBySession', () => {
    it('returns only the user (no session fields)', async () => {
      const service = await buildService();
      const user = { id: 'u1', email: 'alice@beta.io' };
      mockPrisma.session.findUnique.mockResolvedValue(futureSession({ user }));
      await expect(service.getUserBySession('tok')).resolves.toBe(user);
    });

    it('returns null when session is invalid', async () => {
      const service = await buildService();
      mockPrisma.session.findUnique.mockResolvedValue(null);
      await expect(service.getUserBySession('tok')).resolves.toBeNull();
    });

    it('returns null when session is not yet claimed', async () => {
      const service = await buildService();
      mockPrisma.session.findUnique.mockResolvedValue(
        futureSession({ claimedAt: null }),
      );
      await expect(service.getUserBySession('tok')).resolves.toBeNull();
    });
  });

  describe('logout', () => {
    it('deletes the session by token', async () => {
      const service = await buildService();
      mockPrisma.session.delete.mockResolvedValue({});
      await service.logout('tok');
      expect(mockPrisma.session.delete).toHaveBeenCalledWith({
        where: { token: 'tok' },
      });
    });

    it('is idempotent: a missing session (P2025) does not throw', async () => {
      const service = await buildService();
      const err = Object.assign(new Error('Not found'), { code: 'P2025' });
      mockPrisma.session.delete.mockRejectedValue(err);
      await expect(service.logout('tok')).resolves.toBeUndefined();
    });

    it('rethrows non-P2025 errors', async () => {
      const service = await buildService();
      mockPrisma.session.delete.mockRejectedValue(new Error('boom'));
      await expect(service.logout('tok')).rejects.toThrow('boom');
    });

    it('noop on empty token', async () => {
      const service = await buildService();
      await service.logout('');
      expect(mockPrisma.session.delete).not.toHaveBeenCalled();
    });
  });
});
