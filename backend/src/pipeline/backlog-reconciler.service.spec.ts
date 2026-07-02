import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringQueueService } from '../queue/scoring-queue.service';
import { BacklogReconcilerService } from './backlog-reconciler.service';

const mockQueue = { ensureScoringJob: jest.fn().mockResolvedValue(undefined) };
const mockPrisma = {
  vacancy: {
    findMany: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
  },
  user: { findMany: jest.fn() },
  userMatch: { findUnique: jest.fn() },
};

function staleVacancy(overrides: Record<string, unknown> = {}) {
  return {
    id: 'v1',
    title: 'Senior TypeScript Engineer',
    rawText: 'Senior TypeScript engineer, remote EU',
    stack: [],
    seniority: 'senior',
    remote: 'remote-eu',
    status: 'queued',
    ...overrides,
  };
}

describe('BacklogReconcilerService', () => {
  let service: BacklogReconcilerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.vacancy.findMany.mockResolvedValue([]);
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'u0' }]);
    mockPrisma.userMatch.findUnique.mockResolvedValue(null);

    const module = await Test.createTestingModule({
      providers: [
        BacklogReconcilerService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ScoringQueueService, useValue: mockQueue },
      ],
    }).compile();

    service = module.get(BacklogReconcilerService);
  });

  it('does nothing when there is no stale backlog', async () => {
    await expect(service.reconcile()).resolves.toEqual({
      requeued: 0,
      filteredOut: 0,
    });
    expect(mockQueue.ensureScoringJob).not.toHaveBeenCalled();
  });

  it('re-enqueues stale (vacancy × user) pairs without a UserMatch', async () => {
    mockPrisma.vacancy.findMany.mockResolvedValue([staleVacancy()]);
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'u0' }, { id: 'u1' }]);

    await expect(service.reconcile()).resolves.toEqual({
      requeued: 2,
      filteredOut: 0,
    });
    expect(mockPrisma.userMatch.findUnique).toHaveBeenCalledWith({
      where: { userId_vacancyId: { userId: 'u0', vacancyId: 'v1' } },
      select: { id: true },
    });
    expect(mockQueue.ensureScoringJob).toHaveBeenCalledWith('u0', 'v1');
    expect(mockQueue.ensureScoringJob).toHaveBeenCalledWith('u1', 'v1');
    expect(mockPrisma.vacancy.update).not.toHaveBeenCalled();
  });

  it('skips users that already have a UserMatch for the vacancy', async () => {
    mockPrisma.vacancy.findMany.mockResolvedValue([staleVacancy()]);
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'u0' }, { id: 'u1' }]);
    mockPrisma.userMatch.findUnique.mockImplementation(({ where }) =>
      where.userId_vacancyId.userId === 'u0'
        ? Promise.resolve({ id: 'm-existing' })
        : Promise.resolve(null),
    );

    await expect(service.reconcile()).resolves.toEqual({
      requeued: 1,
      filteredOut: 0,
    });
    expect(mockQueue.ensureScoringJob).toHaveBeenCalledTimes(1);
    expect(mockQueue.ensureScoringJob).toHaveBeenCalledWith('u1', 'v1');
  });

  it('marks vacancies failing the current hard filter as filtered_out without per-user lookups', async () => {
    mockPrisma.vacancy.findMany.mockResolvedValue([
      staleVacancy({
        id: 'v2',
        title: 'Associate Brand Manager',
        rawText: 'Drive brand strategy. Remote, full-time.',
        seniority: null,
        remote: null,
      }),
    ]);

    await expect(service.reconcile()).resolves.toEqual({
      requeued: 0,
      filteredOut: 1,
    });
    expect(mockPrisma.vacancy.update).toHaveBeenCalledWith({
      where: { id: 'v2' },
      data: { status: 'filtered_out' },
    });
    expect(mockPrisma.userMatch.findUnique).not.toHaveBeenCalled();
    expect(mockQueue.ensureScoringJob).not.toHaveBeenCalled();
  });

  it('promotes a "new" vacancy to "queued" once users exist', async () => {
    mockPrisma.vacancy.findMany.mockResolvedValue([
      staleVacancy({ id: 'v9', status: 'new' }),
    ]);
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'u0' }]);

    await expect(service.reconcile()).resolves.toEqual({
      requeued: 1,
      filteredOut: 0,
    });
    expect(mockQueue.ensureScoringJob).toHaveBeenCalledWith('u0', 'v9');
    expect(mockPrisma.vacancy.update).toHaveBeenCalledWith({
      where: { id: 'v9' },
      data: { status: 'queued' },
    });
  });

  it('handles a mixed backlog', async () => {
    mockPrisma.vacancy.findMany.mockResolvedValue([
      staleVacancy(),
      staleVacancy({
        id: 'v3',
        title: 'Sales Lead',
        rawText: 'Own the sales funnel. Remote.',
        seniority: null,
        remote: null,
      }),
    ]);

    await expect(service.reconcile()).resolves.toEqual({
      requeued: 1,
      filteredOut: 1,
    });
  });
});
