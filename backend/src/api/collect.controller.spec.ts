import { CollectController } from './collect.controller';
import type { CollectionSchedulerService } from '../collectors/collection-scheduler.service';

function makeScheduler(over: Partial<CollectionSchedulerService> = {}) {
  return {
    triggerManual: jest.fn().mockReturnValue({
      started: true,
      alreadyRunning: false,
    }),
    isRunning: jest.fn().mockReturnValue(true),
    getLastRun: jest.fn().mockReturnValue(null),
    ...over,
  } as unknown as CollectionSchedulerService;
}

describe('CollectController', () => {
  it('starts a manual run and reports running state', () => {
    const scheduler = makeScheduler();
    const controller = new CollectController(scheduler);

    const res = controller.trigger();

    expect(scheduler.triggerManual).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({
      started: true,
      alreadyRunning: false,
      running: true,
    });
  });

  it('reports already-running without starting a second run', () => {
    const scheduler = makeScheduler({
      triggerManual: jest
        .fn()
        .mockReturnValue({ started: false, alreadyRunning: true }),
    });
    const controller = new CollectController(scheduler);

    const res = controller.trigger();

    expect(res.started).toBe(false);
    expect(res.alreadyRunning).toBe(true);
  });

  it('returns last-run summary in status', () => {
    const lastRun = {
      queued: 12,
      duplicate: 3,
      filtered: 8,
      error: 0,
      collectors: 21,
      finishedAt: '2026-06-18T10:00:00.000Z',
    };
    const scheduler = makeScheduler({
      isRunning: jest.fn().mockReturnValue(false),
      getLastRun: jest.fn().mockReturnValue(lastRun),
    });
    const controller = new CollectController(scheduler);

    expect(controller.status()).toEqual({ running: false, lastRun });
  });
});
