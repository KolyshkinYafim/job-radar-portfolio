import { readFileSync } from 'fs';
import { join } from 'path';
import { GreenhouseCollector } from './greenhouse.collector';

const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'greenhouse-jobs.json'), 'utf8'),
) as { jobs: Record<string, unknown>[] };

const jsonResponse = (body: unknown): Response =>
  ({ ok: true, status: 200, json: () => Promise.resolve(body) }) as Response;

const notFound = (): Response => ({ ok: false, status: 404 }) as Response;

describe('GreenhouseCollector', () => {
  let collector: GreenhouseCollector;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    collector = new GreenhouseCollector();
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('maps board jobs to RawVacancy with a per-company source', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.includes('/acme-analytics/') ? jsonResponse(fixture) : notFound(),
      ),
    );

    const vacancies = await collector.collect();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://boards-api.greenhouse.io/v1/boards/acme-analytics/jobs?content=true',
      expect.anything(),
    );
    expect(vacancies).toHaveLength(2);

    const [euJob, onsiteJob] = vacancies;

    expect(euJob).toMatchObject({
      source: 'greenhouse/acme-analytics',
      externalId: '4555001',
      url: 'https://acme-analytics.example.com/jobs/listing/backend-engineer-payments/4555001',
      title: 'Backend Engineer, Payments',
      company: 'Acme-analytics',
      remote: 'remote-eu',
    });
    expect(euJob.postedAt).toEqual(new Date('2026-06-05T12:00:00-04:00'));
    expect(euJob.rawText).toContain('Remote, Europe');
    expect(euJob.rawText).toContain('Work on the payments core.');
    expect(euJob.rawText).not.toMatch(/<[a-z/][^>]*>/i);

    expect(onsiteJob).toMatchObject({
      source: 'greenhouse/acme-analytics',
      externalId: '4555002',
      title: 'Site Reliability Engineer',
      remote: 'onsite',
    });
  });

  it('keeps collecting when one company board fails', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/acme-analytics/')) {
        return Promise.resolve(jsonResponse(fixture));
      }
      if (url.includes('/northwind-cloud/')) {
        return Promise.reject(new Error('network down'));
      }
      return Promise.resolve(notFound());
    });

    const vacancies = await collector.collect();

    expect(vacancies).toHaveLength(2);
    expect(
      vacancies.every((v) => v.source === 'greenhouse/acme-analytics'),
    ).toBe(true);
  });

  it('tolerates jobs with missing fields', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.includes('/acme-analytics/')
          ? jsonResponse({ jobs: [{}, fixture.jobs[0]] })
          : notFound(),
      ),
    );

    const vacancies = await collector.collect();

    expect(vacancies).toHaveLength(2);
    expect(vacancies.map((v) => v.title)).toContain(
      'Backend Engineer, Payments',
    );
  });

  it('returns an empty array when every board request fails', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(collector.collect()).resolves.toEqual([]);
  });

  it('returns an empty array when every board responds non-OK', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await expect(collector.collect()).resolves.toEqual([]);
  });
});
