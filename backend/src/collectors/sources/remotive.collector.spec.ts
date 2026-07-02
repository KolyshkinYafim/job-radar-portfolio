import { readFileSync } from 'fs';
import { join } from 'path';
import { RemotiveCollector } from './remotive.collector';

const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'remotive-jobs.json'), 'utf8'),
) as { jobs: Record<string, unknown>[] };

const jsonResponse = (body: unknown): Response =>
  ({ ok: true, status: 200, json: () => Promise.resolve(body) }) as Response;

describe('RemotiveCollector', () => {
  let collector: RemotiveCollector;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    collector = new RemotiveCollector();
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('maps jobs to RawVacancy and normalizes annual salary ranges', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(fixture));

    const vacancies = await collector.collect();

    expect(vacancies).toHaveLength(2);

    const [withSalary, withoutSalary] = vacancies;

    expect(withSalary).toMatchObject({
      source: 'remotive',
      externalId: '1987001',
      url: 'https://remotive.com/remote-jobs/software-dev/senior-typescript-developer-1987001',
      title: 'Senior TypeScript Developer',
      company: 'Initech',
      salaryMin: 5000,
      salaryMax: 7000,
      currency: 'USD',
      remote: 'remote-global',
    });
    expect(withSalary.stack).toEqual(['typescript', 'node', 'aws']);
    expect(withSalary.postedAt).toEqual(new Date('2026-06-10T08:15:00'));
    expect(withSalary.rawText).toContain('Worldwide');
    expect(withSalary.rawText).toContain('platform team building public APIs');

    expect(withoutSalary).toMatchObject({
      source: 'remotive',
      externalId: '1987002',
      title: 'Python Engineer',
      company: 'Hooli',
      remote: 'remote-global',
    });
    expect(withoutSalary.salaryMin).toBeUndefined();
    expect(withoutSalary.salaryMax).toBeUndefined();
    expect(withoutSalary.currency).toBeUndefined();
  });

  it('parses k-suffixed monthly salaries with an explicit currency', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        jobs: [{ ...fixture.jobs[0], salary: '3k - 5k EUR/month' }],
      }),
    );

    const vacancies = await collector.collect();

    expect(vacancies[0]).toMatchObject({
      salaryMin: 3000,
      salaryMax: 5000,
      currency: 'EUR',
    });
  });

  it('tolerates jobs with missing fields', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ jobs: [{}, fixture.jobs[0]] }),
    );

    const vacancies = await collector.collect();

    expect(vacancies).toHaveLength(2);
    expect(vacancies[0]).toMatchObject({ source: 'remotive', rawText: '' });
    expect(vacancies[1].title).toBe('Senior TypeScript Developer');
  });

  it('returns an empty array when the API is unreachable', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    await expect(collector.collect()).resolves.toEqual([]);
  });

  it('returns an empty array on a non-OK response', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });

    await expect(collector.collect()).resolves.toEqual([]);
  });
});
