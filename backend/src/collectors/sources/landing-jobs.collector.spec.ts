import { readFileSync } from 'fs';
import { join } from 'path';
import { LandingJobsCollector } from './landing-jobs.collector';

const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'landing-jobs.json'), 'utf8'),
) as { jobs: Record<string, unknown>[] };

const jsonResponse = (body: unknown): Response =>
  ({ ok: true, status: 200, json: () => Promise.resolve(body) }) as Response;

describe('LandingJobsCollector', () => {
  let collector: LandingJobsCollector;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    collector = new LandingJobsCollector();
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('maps jobs to RawVacancy and stops after a partial page', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(fixture));

    const vacancies = await collector.collect();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('limit=100&skip=0');
    expect(vacancies).toHaveLength(2);

    const [remoteJob, onsiteJob] = vacancies;

    expect(remoteJob).toMatchObject({
      source: 'landing.jobs',
      externalId: '90001',
      url: 'https://landing.jobs/jobs/90001',
      title: 'Full-stack Engineer',
      salaryMin: 45000,
      salaryMax: 65000,
      currency: 'EUR',
      remote: 'remote-eu',
    });
    expect(remoteJob.company).toBeUndefined();
    expect(remoteJob.stack).toEqual(['Node.js', 'React']);
    expect(remoteJob.postedAt).toEqual(new Date('2026-06-07T09:00:00.000Z'));
    expect(remoteJob.rawText).toContain('Build the marketplace platform.');
    expect(remoteJob.rawText).toContain('Node.js, React, PostgreSQL');
    expect(remoteJob.rawText).toContain('AWS, Terraform');

    expect(onsiteJob).toMatchObject({
      source: 'landing.jobs',
      externalId: '90002',
      url: 'https://landing.jobs/jobs/90002',
      title: 'DevOps Engineer',
      currency: 'EUR',
      remote: 'onsite',
    });
    expect(onsiteJob.salaryMin).toBeUndefined();
    expect(onsiteJob.salaryMax).toBeUndefined();
  });

  it('fetches the next page when the first page is full', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ jobs: Array(100).fill(fixture.jobs[0]) }),
      )
      .mockResolvedValueOnce(jsonResponse(fixture));

    const vacancies = await collector.collect();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain('skip=100');
    expect(vacancies).toHaveLength(102);
  });

  it('tolerates jobs with missing fields', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ jobs: [{}, fixture.jobs[0]] }),
    );

    const vacancies = await collector.collect();

    expect(vacancies).toHaveLength(2);
    expect(vacancies[0]).toMatchObject({
      source: 'landing.jobs',
      rawText: '',
      currency: 'EUR',
    });
    expect(vacancies[0].url).toBeUndefined();
    expect(vacancies[1].title).toBe('Full-stack Engineer');
  });

  it('returns an empty array when the API is unreachable', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    await expect(collector.collect()).resolves.toEqual([]);
  });

  it('returns an empty array on a non-OK response', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 502 });

    await expect(collector.collect()).resolves.toEqual([]);
  });
});
