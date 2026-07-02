import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../prisma/prisma.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

class InMemoryPrisma {
  private users = new Map<string, Record<string, unknown>>();
  private sessions = new Map<string, Record<string, unknown>>();
  private userSeq = 0;
  private sessionSeq = 0;

  user = {
    upsert: jest.fn(
      async ({
        where,
        create,
      }: {
        where: { email: string };
        create: { email: string };
      }) => {
        const existing = [...this.users.values()].find(
          (u) => u.email === where.email,
        );
        if (existing) return existing;
        const u = {
          ...create,
          id: `u${++this.userSeq}`,
          createdAt: new Date(),
          tgChatId: null,
          tgUserId: null,
        };
        this.users.set(u.id, u);
        return u;
      },
    ),
  };

  session = {
    create: jest.fn(
      async ({
        data,
      }: {
        data: { userId: string; token: string; expiresAt: Date };
      }) => {
        const s = { id: `s${++this.sessionSeq}`, ...data, claimedAt: null };
        this.sessions.set(data.token, s);
        return s;
      },
    ),
    updateMany: jest.fn(
      async ({
        where,
        data,
      }: {
        where: {
          token: string;
          claimedAt: null;
          expiresAt: { gt: Date };
        };
        data: { claimedAt: Date };
      }) => {
        let count = 0;
        for (const [key, s] of this.sessions) {
          if (
            s.token === where.token &&
            s.claimedAt === null &&
            (s.expiresAt as Date).getTime() > where.expiresAt.gt.getTime()
          ) {
            this.sessions.set(key, { ...s, ...data });
            count++;
          }
        }
        return { count };
      },
    ),
    findUnique: jest.fn(
      async ({
        where,
        include,
      }: {
        where: { token: string };
        include?: { user?: boolean };
      }) => {
        const s = this.sessions.get(where.token);
        if (!s) return null;
        if (include?.user) {
          return { ...s, user: this.users.get(s.userId as string) };
        }
        return s;
      },
    ),
    delete: jest.fn(async ({ where }: { where: { token: string } }) => {
      const s = this.sessions.get(where.token);
      if (!s) {
        throw Object.assign(new Error('Not found'), { code: 'P2025' });
      }
      this.sessions.delete(where.token);
      return s;
    }),
  };
}

describe('AuthController (HTTP)', () => {
  let app: INestApplication<App>;
  let prisma: InMemoryPrisma;

  beforeEach(async () => {
    prisma = new InMemoryPrisma();
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        AuthGuard,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const values: Record<string, unknown> = {
                'auth.ownerEmail': 'owner@local',
                'auth.betaEmails': 'alice@beta.io',
                'auth.sessionTtlMinutes': 30,
                'auth.secureCookies': false,
              };
              return values[key];
            }),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const extractSidCookie = (raw: unknown): string => {
    const cookies = Array.isArray(raw) ? (raw as string[]) : [raw as string];
    const sid = cookies.find((c) => c.startsWith('sid='));
    expect(sid).toBeDefined();
    return sid!;
  };

  it('full flow: request-link → verify → /me → logout → /me 401', async () => {
    const linkRes = await request(app.getHttpServer())
      .post('/api/auth/request-link')
      .send({ email: 'alice@beta.io' })
      .expect(201);
    const linkBody = linkRes.body as { link: string };
    expect(linkBody.link).toMatch(/^\/api\/auth\/verify\?token=[0-9a-f]{64}$/);
    const token = linkBody.link.split('=')[1];

    const verifyRes = await request(app.getHttpServer())
      .get(`/api/auth/verify?token=${token}`)
      .expect(200);
    const sidCookie = extractSidCookie(verifyRes.headers['set-cookie']);
    expect(sidCookie).toMatch(/HttpOnly/i);
    expect(sidCookie).toMatch(/SameSite=Lax/i);
    expect(sidCookie).toMatch(/Path=\//i);
    expect(sidCookie).toMatch(/Expires=/i);
    expect(verifyRes.body).toEqual({ ok: true });

    const meRes = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', sidCookie)
      .expect(200);
    expect(meRes.body.email).toBe('alice@beta.io');
    expect(meRes.body.id).toMatch(/^u\d+$/);

    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', sidCookie)
      .expect(204);

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', sidCookie)
      .expect(401);
  });

  it('second /verify with the same token → 401 (single-use)', async () => {
    const linkRes = await request(app.getHttpServer())
      .post('/api/auth/request-link')
      .send({ email: 'alice@beta.io' })
      .expect(201);
    const token = (linkRes.body as { link: string }).link.split('=')[1];

    await request(app.getHttpServer())
      .get(`/api/auth/verify?token=${token}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/auth/verify?token=${token}`)
      .expect(401);
  });

  it('rejects non-whitelisted email with 403', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/request-link')
      .send({ email: 'evil@example.com' })
      .expect(403);
  });

  it('rejects missing email with 400', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/request-link')
      .send({})
      .expect(400);
  });

  it('rejects invalid verify token with 401', async () => {
    await request(app.getHttpServer())
      .get('/api/auth/verify?token=notarealtoken')
      .expect(401);
  });

  it('rejects missing token (no ?token param) with 401', async () => {
    await request(app.getHttpServer()).get('/api/auth/verify').expect(401);
  });

  it('redirects 302 → / when Accept: text/html', async () => {
    const linkRes = await request(app.getHttpServer())
      .post('/api/auth/request-link')
      .send({ email: 'alice@beta.io' });
    const token = (linkRes.body as { link: string }).link.split('=')[1];
    const res = await request(app.getHttpServer())
      .get(`/api/auth/verify?token=${token}`)
      .set('Accept', 'text/html')
      .expect(302);
    expect(res.headers.location).toBe('/');
    extractSidCookie(res.headers['set-cookie']);
  });

  it('/me without cookie returns 401', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
  });

  it('logout is idempotent and clears the cookie', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .expect(204);
    const sid = extractSidCookie(res.headers['set-cookie']);
    expect(sid).toMatch(/sid=;/);
    expect(sid).toMatch(/Max-Age=0/i);
  });
});
