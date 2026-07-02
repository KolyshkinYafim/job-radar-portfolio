import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringQueueService } from '../queue/scoring-queue.service';
import type { RawVacancy } from '../common/types';
import { IngestionService } from './ingestion.service';

const mockQueue = {
  enqueueScoring: jest.fn().mockResolvedValue(['score-u0-v-test']),
};
const mockPrisma = {
  vacancy: {
    findUnique: jest.fn(),
    create: jest.fn().mockResolvedValue({ id: 'v-test' }),
    update: jest.fn().mockResolvedValue({ id: 'v-test' }),
  },
};

function makeRaw(overrides: Partial<RawVacancy> = {}): RawVacancy {
  return {
    source: 'test',
    externalId: 'ext-1',
    rawText: 'Senior TypeScript engineer, remote EU, 8000 EUR/month',
    ...overrides,
  };
}

describe('IngestionService', () => {
  let service: IngestionService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.vacancy.findUnique.mockResolvedValue(null);

    const module = await Test.createTestingModule({
      providers: [
        IngestionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ScoringQueueService, useValue: mockQueue },
      ],
    }).compile();

    service = module.get(IngestionService);
  });

  it('queues a valid vacancy', async () => {
    const result = await service.ingest(makeRaw());
    expect(result.outcome).toBe('queued');
    expect(mockQueue.enqueueScoring).toHaveBeenCalledWith('v-test');
    expect(mockPrisma.vacancy.update).not.toHaveBeenCalled();
  });

  it('leaves the vacancy as "new" when there are no users to enqueue', async () => {
    mockQueue.enqueueScoring.mockResolvedValueOnce([]);
    const result = await service.ingest(makeRaw());
    expect(result.outcome).toBe('queued');
    expect(mockPrisma.vacancy.update).toHaveBeenCalledWith({
      where: { id: 'v-test' },
      data: { status: 'new' },
    });
  });

  it('filters a non-engineering role named only in the body', async () => {
    const result = await service.ingest(
      makeRaw({
        title: 'Growth Specialist',
        rawText:
          'Own the sales funnel and close enterprise deals. Stack: TypeScript, Node.js.',
      }),
    );
    expect(result.outcome).toBe('filtered_out');
    expect(result.reasons).toContain('non-engineering role');
    expect(result.reasons).not.toContain('no tech signal');
    expect(mockPrisma.vacancy.create).not.toHaveBeenCalled();
  });

  it('returns duplicate when dedupHash exists', async () => {
    mockPrisma.vacancy.findUnique.mockResolvedValue({ id: 'existing' });
    const result = await service.ingest(makeRaw());
    expect(result.outcome).toBe('duplicate');
    expect(result.vacancyId).toBe('existing');
    expect(mockQueue.enqueueScoring).not.toHaveBeenCalled();
  });

  it('filters junior positions', async () => {
    const result = await service.ingest(
      makeRaw({ rawText: 'Junior developer remote EU' }),
    );
    expect(result.outcome).toBe('filtered_out');
    expect(result.reasons).toContain('junior position');
    expect(mockPrisma.vacancy.create).not.toHaveBeenCalled();
  });

  it('filters onsite non-Amsterdam', async () => {
    const result = await service.ingest(
      makeRaw({
        rawText: 'Senior engineer, on-site, Berlin office',
        remote: 'onsite',
      }),
    );
    expect(result.outcome).toBe('filtered_out');
    expect(result.reasons).toContain('onsite outside Amsterdam');
  });

  it('allows onsite Amsterdam', async () => {
    const result = await service.ingest(
      makeRaw({
        rawText: 'Senior engineer, on-site Amsterdam office',
        remote: 'onsite',
      }),
    );
    expect(result.outcome).toBe('queued');
  });

  it('filters vacancies without a tech signal', async () => {
    const result = await service.ingest(
      makeRaw({
        title: 'Associate Brand Manager Innovation',
        rawText:
          'Drive brand strategy and our innovation pipeline. Remote, full-time.',
      }),
    );
    expect(result.outcome).toBe('filtered_out');
    expect(result.reasons).toContain('no tech signal');
    expect(mockPrisma.vacancy.create).not.toHaveBeenCalled();
  });

  it('keeps Russian-language developer posts', async () => {
    const result = await service.ingest(
      makeRaw({
        rawText: 'Ищем разработчика на TypeScript, удалённо, от 8000 EUR',
      }),
    );
    expect(result.outcome).toBe('queued');
  });

  it('keeps non-tech-worded vacancies when the collector provided a stack', async () => {
    const result = await service.ingest(
      makeRaw({
        title: 'Senior Specialist',
        rawText: 'Join our platform team. Remote EU.',
        stack: ['TypeScript', 'NestJS'],
      }),
    );
    expect(result.outcome).toBe('queued');
  });

  it('filters early-career roles by title even when tech-worded', async () => {
    const result = await service.ingest(
      makeRaw({
        title: 'Graduate Software Engineer',
        rawText:
          'Graduate program. Work with TypeScript and Node.js. Remote EU.',
      }),
    );
    expect(result.outcome).toBe('filtered_out');
    expect(result.reasons).toContain('junior position');
  });

  it('filters non-engineering roles by title (aggressive gate)', async () => {
    const result = await service.ingest(
      makeRaw({
        title: 'Sales Engineer',
        rawText:
          'Sell our platform to enterprise customers. Remote EU. Partner with engineering.',
      }),
    );
    expect(result.outcome).toBe('filtered_out');
    expect(result.reasons).toContain('non-engineering role');
    expect(mockPrisma.vacancy.create).not.toHaveBeenCalled();
  });

  it('keeps a senior engineering role through the aggressive gate', async () => {
    const result = await service.ingest(
      makeRaw({
        title: 'Senior Backend Engineer',
        rawText: 'Build APIs with Node.js and PostgreSQL. Remote EU.',
      }),
    );
    expect(result.outcome).toBe('queued');
  });

  it('dedupes the same company+title across sources', async () => {
    await service.ingest(
      makeRaw({
        source: 'remoteok',
        title: 'Senior TypeScript Engineer',
        company: 'Acme GmbH',
      }),
    );
    const firstHash =
      mockPrisma.vacancy.findUnique.mock.calls[0][0].where.dedupHash;

    await service.ingest(
      makeRaw({
        source: 'himalayas',
        externalId: 'other-id',
        title: 'Senior  typescript ENGINEER',
        company: 'Acme, GmbH',
      }),
    );
    const secondHash =
      mockPrisma.vacancy.findUnique.mock.calls[1][0].where.dedupHash;

    expect(secondHash).toBe(firstHash);
  });
});
