import { readFileSync } from 'fs';
import { join } from 'path';
import { ArbeitnowCollector } from './arbeitnow.collector';

const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'arbeitnow-jobs.json'), 'utf8'),
) as { data: Record<string, unknown>[] };

const jsonResponse = (body: unknown): Response =>
  ({ ok: true, status: 200, json: () => Promise.resolve(body) }) as Response;

describe('ArbeitnowCollector', () => {
  let collector: ArbeitnowCollector;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    collector = new ArbeitnowCollector();
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('maps jobs to RawVacancy with remote flag driving the remote mode', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(fixture));

    const vacancies = await collector.collect();

    expect(vacancies).toHaveLength(2);

    const [remoteJob, onsiteJob] = vacancies;

    expect(remoteJob).toMatchObject({
      source: 'arbeitnow',
      externalId: 'senior-php-developer-berlin-123456',
      url: 'https://www.arbeitnow.com/jobs/companies/wunderflats/senior-php-developer-berlin-123456',
      title: 'Senior PHP Developer',
      company: 'Wunderflats',
      remote: 'remote-eu',
    });
    expect(remoteJob.stack).toEqual(['PHP', 'Symfony']);
    expect(remoteJob.postedAt).toEqual(new Date(1765012345 * 1000));
    expect(remoteJob.rawText).toContain('Berlin');
    expect(remoteJob.rawText).toContain('rental platform services');

    expect(onsiteJob).toMatchObject({
      source: 'arbeitnow',
      externalId: 'qa-engineer-munich-654321',
      title: 'QA Engineer',
      company: 'Allianz',
      remote: 'onsite',
    });
    expect(onsiteJob.salaryMin).toBeUndefined();
  });

  it('fetches the next page while the API reports more results', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: fixture.data,
          links: { next: 'https://www.arbeitnow.com/api/job-board-api?page=2' },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ data: [fixture.data[0]], links: { next: null } }),
      );

    const vacancies = await collector.collect();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('page=1');
    expect(fetchMock.mock.calls[1][0]).toContain('page=2');
    expect(vacancies).toHaveLength(3);
  });

  it('tolerates jobs with missing fields', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: [{}, fixture.data[0]], links: { next: null } }),
    );

    const vacancies = await collector.collect();

    expect(vacancies).toHaveLength(2);
    expect(vacancies[0]).toMatchObject({ source: 'arbeitnow', rawText: '' });
    expect(vacancies[1].title).toBe('Senior PHP Developer');
  });

  it('returns an empty array when the API is unreachable', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    await expect(collector.collect()).resolves.toEqual([]);
  });

  it('returns an empty array on a non-OK response', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429 });

    await expect(collector.collect()).resolves.toEqual([]);
  });
});
