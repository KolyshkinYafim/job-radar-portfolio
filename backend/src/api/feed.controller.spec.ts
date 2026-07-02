import type { User } from '@prisma/client';
import { FeedController } from './feed.controller';
import { VacanciesService } from './vacancies.service';

describe('FeedController', () => {
  const user = { id: 'user-42' } as User;
  let svc: jest.Mocked<
    Pick<VacanciesService, 'list' | 'findOne' | 'updateApplicationStatus'>
  >;
  let controller: FeedController;

  beforeEach(() => {
    svc = {
      list: jest.fn(),
      findOne: jest.fn(),
      updateApplicationStatus: jest.fn(),
    };
    controller = new FeedController(svc as unknown as VacanciesService);
  });

  it('lists matches scoped to the session user', () => {
    controller.list(user, { minScore: 70 });
    expect(svc.list).toHaveBeenCalledWith('user-42', { minScore: 70 });
  });

  it('reads a single match for the session user', () => {
    controller.findOne(user, 'vac-1');
    expect(svc.findOne).toHaveBeenCalledWith('user-42', 'vac-1');
  });

  it('updates application status for the session user', () => {
    controller.updateApplication(user, 'vac-1', { status: 'applied' });
    expect(svc.updateApplicationStatus).toHaveBeenCalledWith(
      'user-42',
      'vac-1',
      'applied',
    );
  });
});
