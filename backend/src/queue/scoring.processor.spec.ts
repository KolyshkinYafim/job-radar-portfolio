import { Job } from 'bullmq';
import { ScoreResult, ScoringJobData, VacancyStatus } from '../common/types';
import { ScoringProcessor } from './scoring.processor';

describe('ScoringProcessor', () => {
  const vacancy = {
    id: 'v1',
    source: 'tg:@jobs',
    externalId: null,
    url: 'https://example.com/job',
    title: 'Senior TypeScript Engineer',
    company: 'Acme',
    rawText: 'Build things with NestJS.',
    stack: ['TypeScript'],
    salaryMin: 80000,
    salaryMax: 95000,
    currency: 'EUR',
    remote: 'remote-eu',
    seniority: 'senior',
    dedupHash: 'hash',
    postedAt: null,
    createdAt: new Date(),
    status: VacancyStatus.Queued,
  };

  const userProfile = {
    id: 'p1',
    userId: 'u0',
    cvText: '',
    coreStack: ['TypeScript'],
    strongPlus: [],
    redFlags: [],
    seniority: 'senior',
    locationPref: ['EU remote'],
    salaryMin: 75000,
    salaryTarget: 85000,
    updatedAt: new Date(),
  };

  const scoreResult: ScoreResult = {
    score: 80,
    location: 'Remote EU',
    reasonsPro: ['Strong stack match'],
    reasonsCon: [],
    stackMatch: ['TypeScript'],
    redFlags: [],
    model: 'qwen3-32b',
    latencyMs: 1200,
  };

  const job = {
    data: { vacancyId: 'v1', userId: 'u0' },
  } as Job<ScoringJobData>;

  let prisma: {
    vacancy: {
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    userMatch: { findUnique: jest.Mock; upsert: jest.Mock };
  };
  let scoring: { isHealthy: jest.Mock; scoreVacancy: jest.Mock };
  let userProfileService: { getByUserId: jest.Mock };
  let config: { get: jest.Mock };
  let notifier: { notifyScored: jest.Mock };

  const createProcessor = (withNotifier = true): ScoringProcessor =>
    new ScoringProcessor(
      prisma as never,
      scoring as never,
      userProfileService as never,
      config as never,
      withNotifier ? notifier : undefined,
    );

  beforeEach(() => {
    prisma = {
      vacancy: {
        findUnique: jest.fn().mockResolvedValue({ ...vacancy }),
        update: jest.fn().mockResolvedValue(undefined),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      userMatch: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue(undefined),
      },
    };
    scoring = {
      isHealthy: jest.fn().mockResolvedValue(true),
      scoreVacancy: jest.fn().mockResolvedValue({ ...scoreResult }),
    };
    userProfileService = {
      getByUserId: jest.fn().mockResolvedValue({ ...userProfile }),
    };
    config = { get: jest.fn().mockReturnValue(65) };
    notifier = { notifyScored: jest.fn().mockResolvedValue(undefined) };
  });

  it('persists a UserMatch and notifies when above threshold', async () => {
    await createProcessor().process(job);

    const expectedMatch = {
      score: 80,
      location: 'Remote EU',
      reasonsPro: ['Strong stack match'],
      reasonsCon: [],
      redFlags: [],
      model: 'qwen3-32b',
    };
    expect(prisma.userMatch.upsert).toHaveBeenCalledWith({
      where: { userId_vacancyId: { userId: 'u0', vacancyId: 'v1' } },
      create: { userId: 'u0', vacancyId: 'v1', ...expectedMatch },
      update: expectedMatch,
    });
    expect(scoring.scoreVacancy).toHaveBeenCalledWith(
      expect.objectContaining({ title: vacancy.title }),
      expect.objectContaining({ core_stack: ['TypeScript'] }),
      { userId: 'u0', taskType: 'score' },
    );
    expect(notifier.notifyScored).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'v1',
        title: vacancy.title,
        company: 'Acme',
      }),
      expect.objectContaining({ score: 80 }),
    );
    expect(prisma.vacancy.update).toHaveBeenCalledWith({
      where: { id: 'v1' },
      data: { status: VacancyStatus.Notified },
    });
  });

  it('sets status scored via a guarded updateMany that cannot downgrade an already-notified vacancy', async () => {
    scoring.scoreVacancy.mockResolvedValue({ ...scoreResult, score: 40 });

    await createProcessor().process(job);

    expect(notifier.notifyScored).not.toHaveBeenCalled();
    expect(prisma.vacancy.update).not.toHaveBeenCalled();
    expect(prisma.vacancy.updateMany).toHaveBeenCalledWith({
      where: { id: 'v1', status: { not: VacancyStatus.Notified } },
      data: { status: VacancyStatus.Scored },
    });
  });

  it('throws when the LLM is offline so BullMQ retries', async () => {
    scoring.isHealthy.mockResolvedValue(false);

    await expect(createProcessor().process(job)).rejects.toThrow('LLM offline');

    expect(scoring.scoreVacancy).not.toHaveBeenCalled();
    expect(prisma.userMatch.upsert).not.toHaveBeenCalled();
    expect(prisma.vacancy.update).not.toHaveBeenCalled();
  });

  it('skips when a UserMatch for this (user,vacancy) already exists', async () => {
    prisma.userMatch.findUnique.mockResolvedValue({ id: 'm1' });

    await createProcessor().process(job);

    expect(prisma.vacancy.findUnique).not.toHaveBeenCalled();
    expect(scoring.isHealthy).not.toHaveBeenCalled();
    expect(scoring.scoreVacancy).not.toHaveBeenCalled();
    expect(prisma.userMatch.upsert).not.toHaveBeenCalled();
    expect(prisma.vacancy.update).not.toHaveBeenCalled();
  });

  it('drops the job when the vacancy is missing', async () => {
    prisma.vacancy.findUnique.mockResolvedValue(null);

    await createProcessor().process(job);

    expect(scoring.scoreVacancy).not.toHaveBeenCalled();
    expect(prisma.userMatch.upsert).not.toHaveBeenCalled();
    expect(prisma.vacancy.update).not.toHaveBeenCalled();
  });

  it('drops the job when the vacancy was filtered out after enqueueing', async () => {
    prisma.vacancy.findUnique.mockResolvedValue({
      ...vacancy,
      status: VacancyStatus.FilteredOut,
    });

    await createProcessor().process(job);

    expect(scoring.isHealthy).not.toHaveBeenCalled();
    expect(scoring.scoreVacancy).not.toHaveBeenCalled();
    expect(prisma.userMatch.upsert).not.toHaveBeenCalled();
    expect(prisma.vacancy.update).not.toHaveBeenCalled();
  });

  it('skips and warns when the user has no UserProfile', async () => {
    userProfileService.getByUserId.mockResolvedValue(null);

    await createProcessor().process(job);

    expect(scoring.isHealthy).not.toHaveBeenCalled();
    expect(scoring.scoreVacancy).not.toHaveBeenCalled();
    expect(prisma.userMatch.upsert).not.toHaveBeenCalled();
    expect(prisma.vacancy.update).not.toHaveBeenCalled();
  });

  it('keeps the persisted match and sets status scored when the notifier fails', async () => {
    notifier.notifyScored.mockRejectedValue(new Error('Telegram down'));

    await createProcessor().process(job);

    expect(prisma.userMatch.upsert).toHaveBeenCalled();
    expect(prisma.vacancy.updateMany).toHaveBeenCalledWith({
      where: { id: 'v1', status: { not: VacancyStatus.Notified } },
      data: { status: VacancyStatus.Scored },
    });
  });

  it('sets status scored when no notifier is bound', async () => {
    await createProcessor(false).process(job);

    expect(prisma.vacancy.updateMany).toHaveBeenCalledWith({
      where: { id: 'v1', status: { not: VacancyStatus.Notified } },
      data: { status: VacancyStatus.Scored },
    });
  });
});
