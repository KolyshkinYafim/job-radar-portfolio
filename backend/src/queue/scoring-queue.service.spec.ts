import { ScoringQueueService } from './scoring-queue.service';

describe('ScoringQueueService', () => {
  let queue: { add: jest.Mock; getJob: jest.Mock; getJobCounts: jest.Mock };
  let prisma: { user: { findMany: jest.Mock } };
  let service: ScoringQueueService;

  beforeEach(() => {
    queue = {
      add: jest.fn().mockResolvedValue({ id: 'score:v1' }),
      getJob: jest.fn().mockResolvedValue(undefined),
      getJobCounts: jest.fn().mockResolvedValue({
        waiting: 1,
        delayed: 2,
        active: 0,
        failed: 3,
        completed: 4,
      }),
    };
    prisma = {
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'u0' }]) },
    };
    service = new ScoringQueueService(queue as never, prisma as any);
  });

  it('fans out one job per active user with a deterministic per-user job id', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 'u0' }, { id: 'u1' }]);

    const jobIds = await service.enqueueScoring('v1');

    expect(prisma.user.findMany).toHaveBeenCalledWith({ select: { id: true } });
    expect(jobIds).toEqual(['score-u0-v1', 'score-u1-v1']);
    expect(queue.add).toHaveBeenNthCalledWith(
      1,
      'score',
      { vacancyId: 'v1', userId: 'u0' },
      {
        jobId: 'score-u0-v1',
        attempts: 30,
        backoff: { type: 'custom' },
        removeOnComplete: { count: 200 },
        removeOnFail: false,
      },
    );
    expect(queue.add).toHaveBeenNthCalledWith(
      2,
      'score',
      { vacancyId: 'v1', userId: 'u1' },
      expect.objectContaining({ jobId: 'score-u1-v1' }),
    );
  });

  it('returns an empty list when no active users exist', async () => {
    prisma.user.findMany.mockResolvedValue([]);

    const jobIds = await service.enqueueScoring('v1');

    expect(jobIds).toEqual([]);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('ensures a per-user job exists when none is present', async () => {
    await service.ensureScoringJob('u0', 'v1');

    expect(queue.getJob).toHaveBeenCalledWith('score-u0-v1');
    expect(queue.add).toHaveBeenCalledWith(
      'score',
      { vacancyId: 'v1', userId: 'u0' },
      expect.objectContaining({ jobId: 'score-u0-v1' }),
    );
  });

  it('retries an existing failed per-user job instead of re-adding', async () => {
    const failedJob = {
      isFailed: jest.fn().mockResolvedValue(true),
      retry: jest.fn(),
    };
    queue.getJob.mockResolvedValue(failedJob);

    await service.ensureScoringJob('u0', 'v1');

    expect(failedJob.retry).toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('leaves a pending per-user job untouched', async () => {
    const pendingJob = {
      isFailed: jest.fn().mockResolvedValue(false),
      retry: jest.fn(),
    };
    queue.getJob.mockResolvedValue(pendingJob);

    await service.ensureScoringJob('u0', 'v1');

    expect(pendingJob.retry).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('reports job counts for health checks', async () => {
    await expect(service.counts()).resolves.toEqual({
      waiting: 1,
      delayed: 2,
      active: 0,
      failed: 3,
      completed: 4,
    });
    expect(queue.getJobCounts).toHaveBeenCalledWith(
      'waiting',
      'delayed',
      'active',
      'failed',
      'completed',
    );
  });

  it('defaults missing counts to zero', async () => {
    queue.getJobCounts.mockResolvedValue({ waiting: 5 });

    await expect(service.counts()).resolves.toEqual({
      waiting: 5,
      delayed: 0,
      active: 0,
      failed: 0,
      completed: 0,
    });
  });
});
