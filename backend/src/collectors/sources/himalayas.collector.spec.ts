import { readFileSync } from 'fs';
import { join } from 'path';
import { HimalayasCollector } from './himalayas.collector';

const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'himalayas-jobs.json'), 'utf8'),
) as { jobs: Record<string, unknown>[] };

const jsonResponse = (body: unknown): Response =>
  ({ ok: true, status: 200, json: () => Promise.resolve(body) }) as Response;

describe('HimalayasCollector', () => {
  let collector: HimalayasCollector;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    collector = new HimalayasCollector();
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('maps jobs to RawVacancy and converts yearly salaries to monthly', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(fixture));

    const vacancies = await collector.collect();

    expect(vacancies).toHaveLength(2);

    const [euJob, globalJob] = vacancies;

    expect(euJob).toMatchObject({
      source: 'himalayas',
      externalId: '70000123',
      url: 'https://himalayas.app/companies/acme-robotics/jobs/senior-backend-engineer',
      title: 'Senior Backend Engineer',
      company: 'Acme Robotics',
      salaryMin: 7500,
      salaryMax: 10000,
      currency: 'EUR',
      remote: 'remote-eu',
      seniority: 'senior',
    });
    expect(euJob.stack).toEqual(['Backend', 'Node.js']);
    expect(euJob.postedAt).toEqual(new Date(1765360800 * 1000));
    expect(euJob.rawText).toContain('Build distributed systems.');
    expect(euJob.rawText).toContain('event-driven services');

    expect(globalJob).toMatchObject({
      source: 'himalayas',
      externalId: '70000456',
      title: 'Product Designer',
      company: 'Globex',
      currency: 'USD',
      remote: 'remote-global',
      seniority: 'mid',
    });
    expect(globalJob.salaryMin).toBeUndefined();
    expect(globalJob.salaryMax).toBeUndefined();
  });

  it('requests the API with the configured page size', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(fixture));

    await collector.collect();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://himalayas.app/jobs/api?limit=100',
    );
  });

  it('tolerates jobs with missing fields', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ jobs: [{}, fixture.jobs[0]] }),
    );

    const vacancies = await collector.collect();

    expect(vacancies).toHaveLength(2);
    expect(vacancies[0]).toMatchObject({ source: 'himalayas', rawText: '' });
    expect(vacancies[1].title).toBe('Senior Backend Engineer');
  });

  it('returns an empty array when the API is unreachable', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    await expect(collector.collect()).resolves.toEqual([]);
  });

  it('returns an empty array on a non-OK response', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });

    await expect(collector.collect()).resolves.toEqual([]);
  });
});
