import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { User, UserProfile } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { ProfileParserService } from '../scoring/profile-parser.service';
import { ProfileController } from './profile.controller';
import { UserProfileService } from './user-profile.service';

const TEST_TOKEN = 'test-session-token';
const TEST_USER_ID = 'user-alice-id';

const TEST_USER = {
  id: TEST_USER_ID,
  email: 'alice@beta.io',
  createdAt: new Date(),
  tgChatId: null,
  tgUserId: null,
} as unknown as User;

const BASE_PROFILE: UserProfile = {
  id: 'profile-1',
  userId: TEST_USER_ID,
  cvText: 'Five years of TypeScript',
  coreStack: ['NestJS', 'React'],
  strongPlus: ['PostgreSQL'],
  redFlags: ['PHP'],
  seniority: 'senior',
  locationPref: ['Remote'],
  salaryMin: 5000,
  salaryTarget: 7000,
  updatedAt: new Date('2026-01-01'),
};

describe('ProfileController (HTTP)', () => {
  let app: INestApplication<App>;
  let authSvc: { getUserBySession: jest.Mock };
  let profileSvc: {
    getByUserId: jest.Mock;
    upsert: jest.Mock;
    createFromDraft: jest.Mock;
  };
  let parserSvc: { parseCv: jest.Mock };

  beforeEach(async () => {
    authSvc = { getUserBySession: jest.fn().mockResolvedValue(TEST_USER) };
    profileSvc = {
      getByUserId: jest.fn(),
      upsert: jest.fn(),
      createFromDraft: jest.fn(),
    };
    parserSvc = { parseCv: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [ProfileController],
      providers: [
        AuthGuard,
        { provide: AuthService, useValue: authSvc },
        { provide: UserProfileService, useValue: profileSvc },
        { provide: ProfileParserService, useValue: parserSvc },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const withAuth = () => `sid=${TEST_TOKEN}`;

  describe('GET /api/profile', () => {
    it('returns 401 when no cookie is present', async () => {
      await request(app.getHttpServer()).get('/api/profile').expect(401);
      expect(authSvc.getUserBySession).not.toHaveBeenCalled();
    });

    it('returns 401 when cookie is present but session is invalid', async () => {
      authSvc.getUserBySession.mockResolvedValue(null);
      await request(app.getHttpServer())
        .get('/api/profile')
        .set('Cookie', withAuth())
        .expect(401);
    });

    it('returns 404 when authenticated but profile does not exist', async () => {
      profileSvc.getByUserId.mockResolvedValue(null);
      await request(app.getHttpServer())
        .get('/api/profile')
        .set('Cookie', withAuth())
        .expect(404);
      expect(profileSvc.getByUserId).toHaveBeenCalledWith(TEST_USER_ID);
    });

    it('returns 200 with full profile shape when profile exists', async () => {
      profileSvc.getByUserId.mockResolvedValue(BASE_PROFILE);
      const res = await request(app.getHttpServer())
        .get('/api/profile')
        .set('Cookie', withAuth())
        .expect(200);

      const body = res.body as Record<string, unknown>;
      expect(body.id).toBe(BASE_PROFILE.id);
      expect(body.userId).toBe(BASE_PROFILE.userId);
      expect(body.cvText).toBe(BASE_PROFILE.cvText);
      expect(body.coreStack).toEqual(BASE_PROFILE.coreStack);
      expect(body.strongPlus).toEqual(BASE_PROFILE.strongPlus);
      expect(body.redFlags).toEqual(BASE_PROFILE.redFlags);
      expect(body.seniority).toBe(BASE_PROFILE.seniority);
      expect(body.locationPref).toEqual(BASE_PROFILE.locationPref);
      expect(body.salaryMin).toBe(BASE_PROFILE.salaryMin);
      expect(body.salaryTarget).toBe(BASE_PROFILE.salaryTarget);
    });
  });

  describe('PUT /api/profile', () => {
    it('returns 401 when no cookie is present', async () => {
      await request(app.getHttpServer())
        .put('/api/profile')
        .send({ coreStack: ['NestJS'] })
        .expect(401);
    });

    it('passes partial patch to upsert and returns 200', async () => {
      const updated = { ...BASE_PROFILE, coreStack: ['TypeScript'] };
      profileSvc.upsert.mockResolvedValue(updated);

      const res = await request(app.getHttpServer())
        .put('/api/profile')
        .set('Cookie', withAuth())
        .send({ coreStack: ['TypeScript'] })
        .expect(200);

      expect((res.body as Record<string, unknown>).coreStack).toEqual([
        'TypeScript',
      ]);
      expect(profileSvc.upsert).toHaveBeenCalledWith(TEST_USER_ID, {
        coreStack: ['TypeScript'],
      });
    });

    it('partial patch preserves other fields (service responsibility, verified via upsert call)', async () => {
      profileSvc.upsert.mockResolvedValue(BASE_PROFILE);

      await request(app.getHttpServer())
        .put('/api/profile')
        .set('Cookie', withAuth())
        .send({ salaryMin: 6000 })
        .expect(200);

      expect(profileSvc.upsert).toHaveBeenCalledWith(TEST_USER_ID, {
        salaryMin: 6000,
      });
    });

    it('strips unknown fields — only known fields reach upsert', async () => {
      profileSvc.upsert.mockResolvedValue(BASE_PROFILE);

      await request(app.getHttpServer())
        .put('/api/profile')
        .set('Cookie', withAuth())
        .send({ unknownField: 'ignored', coreStack: ['Go'] })
        .expect(200);

      expect(profileSvc.upsert).toHaveBeenCalledWith(TEST_USER_ID, {
        coreStack: ['Go'],
      });
    });

    it('accepts seniority: null (nullable field)', async () => {
      profileSvc.upsert.mockResolvedValue({ ...BASE_PROFILE, seniority: null });

      await request(app.getHttpServer())
        .put('/api/profile')
        .set('Cookie', withAuth())
        .send({ seniority: null })
        .expect(200);

      expect(profileSvc.upsert).toHaveBeenCalledWith(TEST_USER_ID, {
        seniority: null,
      });
    });

    it('accepts salaryTarget: null (nullable number field)', async () => {
      profileSvc.upsert.mockResolvedValue({
        ...BASE_PROFILE,
        salaryTarget: null,
      });

      await request(app.getHttpServer())
        .put('/api/profile')
        .set('Cookie', withAuth())
        .send({ salaryTarget: null })
        .expect(200);

      expect(profileSvc.upsert).toHaveBeenCalledWith(TEST_USER_ID, {
        salaryTarget: null,
      });
    });

    it('returns 400 when body is an array', async () => {
      await request(app.getHttpServer())
        .put('/api/profile')
        .set('Cookie', withAuth())
        .send([])
        .expect(400);
    });

    it('returns 400 when body is a JSON string', async () => {
      await request(app.getHttpServer())
        .put('/api/profile')
        .set('Cookie', withAuth())
        .type('json')
        .send('"foo"')
        .expect(400);
    });

    it('returns 400 when body is JSON null', async () => {
      await request(app.getHttpServer())
        .put('/api/profile')
        .set('Cookie', withAuth())
        .type('json')
        .send('null')
        .expect(400);
    });

    it('returns 400 when coreStack is not an array of strings', async () => {
      await request(app.getHttpServer())
        .put('/api/profile')
        .set('Cookie', withAuth())
        .send({ coreStack: 'NestJS' })
        .expect(400);
    });

    it('returns 400 when coreStack contains non-string elements', async () => {
      await request(app.getHttpServer())
        .put('/api/profile')
        .set('Cookie', withAuth())
        .send({ coreStack: ['ok', 42] })
        .expect(400);
    });

    it('returns 400 when cvText is not a string', async () => {
      await request(app.getHttpServer())
        .put('/api/profile')
        .set('Cookie', withAuth())
        .send({ cvText: 42 })
        .expect(400);
    });

    it('returns 400 when salaryMin is not a number or null', async () => {
      await request(app.getHttpServer())
        .put('/api/profile')
        .set('Cookie', withAuth())
        .send({ salaryMin: 'five-thousand' })
        .expect(400);
    });

    it('returns 400 when seniority is not a string or null', async () => {
      await request(app.getHttpServer())
        .put('/api/profile')
        .set('Cookie', withAuth())
        .send({ seniority: 42 })
        .expect(400);
    });
  });

  describe('POST /api/profile/parse', () => {
    const DRAFT = {
      coreStack: ['TypeScript', 'NestJS'],
      strongPlus: ['React'],
      redFlags: [],
      seniority: 'senior',
      locationPref: ['Remote EU'],
      salaryMin: 70000,
      salaryTarget: 90000,
    };

    it('returns 401 when no cookie is present', async () => {
      await request(app.getHttpServer())
        .post('/api/profile/parse')
        .send({ cvText: 'whatever' })
        .expect(401);
      expect(parserSvc.parseCv).not.toHaveBeenCalled();
    });

    it('returns 400 when cvText is missing', async () => {
      await request(app.getHttpServer())
        .post('/api/profile/parse')
        .set('Cookie', withAuth())
        .send({})
        .expect(400);
      expect(parserSvc.parseCv).not.toHaveBeenCalled();
    });

    it('returns 400 when cvText is an empty string', async () => {
      await request(app.getHttpServer())
        .post('/api/profile/parse')
        .set('Cookie', withAuth())
        .send({ cvText: '   ' })
        .expect(400);
      expect(parserSvc.parseCv).not.toHaveBeenCalled();
    });

    it('returns 400 when cvText is not a string', async () => {
      await request(app.getHttpServer())
        .post('/api/profile/parse')
        .set('Cookie', withAuth())
        .send({ cvText: 42 })
        .expect(400);
      expect(parserSvc.parseCv).not.toHaveBeenCalled();
    });

    it('returns 200 with ProfileDraft and forwards (cvText, userId)', async () => {
      parserSvc.parseCv.mockResolvedValue(DRAFT);

      const res = await request(app.getHttpServer())
        .post('/api/profile/parse')
        .set('Cookie', withAuth())
        .send({ cvText: 'Senior TypeScript engineer with NestJS...' })
        .expect(200);

      expect(res.body).toEqual(DRAFT);
      expect(parserSvc.parseCv).toHaveBeenCalledWith(
        'Senior TypeScript engineer with NestJS...',
        TEST_USER_ID,
      );
    });
  });
});
