import { readFileSync } from 'fs';
import { join } from 'path';
import { NoFluffJobsCollector } from './nofluffjobs.collector';

const fixture = JSON.parse(
  readFileSync(
    join(__dirname, 'fixtures', 'nofluffjobs-postings.json'),
    'utf8',
  ),
) as { postings: Record<string, unknown>[] };

const jsonResponse = (body: unknown): Response =>
  ({ ok: true, status: 200, json: () => Promise.resolve(body) }) as Response;

describe('NoFluffJobsCollector', () => {
  let collector: NoFluffJobsCollector;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    collector = new NoFluffJobsCollector();
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('maps postings to RawVacancy and resolves remote mode from location.fullyRemote', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(fixture));

    const vacancies = await collector.collect();

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' });
    expect(vacancies).toHaveLength(2);

    const [remoteJob, onsiteJob] = vacancies;

    expect(remoteJob).toMatchObject({
      source: 'nofluffjobs',
      externalId: 'senior-backend-engineer-acme-software-remote',
      url: 'https://nofluffjobs.com/job/senior-backend-engineer-acme-software-remote',
      title: 'Senior Backend Engineer',
      company: 'Acme Software',
      salaryMin: 22000,
      salaryMax: 30000,
      currency: 'PLN',
      remote: 'remote-eu',
      seniority: 'senior',
    });
    expect(remoteJob.stack).toEqual([]);
    expect(remoteJob.postedAt).toEqual(new Date(1781532259715));
    expect(remoteJob.rawText).toContain('Amsterdam');

    expect(onsiteJob).toMatchObject({
      source: 'nofluffjobs',
      externalId: 'junior-frontend-developer-pixel-labs-krakow',
      company: 'Pixel Labs',
      remote: 'onsite',
      seniority: 'junior',
    });
    expect(onsiteJob.rawText).toContain('Kraków');
    expect(onsiteJob.salaryMin).toBeUndefined();
    expect(onsiteJob.salaryMax).toBeUndefined();
    expect(onsiteJob.currency).toBeUndefined();
  });

  it('ignores top-level fullyRemote and treats a non-remote Amsterdam posting as hybrid', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        postings: [
          {
            ...fixture.postings[0],
            fullyRemote: true,
            location: { places: [{ city: 'Amsterdam' }], fullyRemote: false },
          },
        ],
      }),
    );

    const [vacancy] = await collector.collect();

    expect(vacancy.remote).toBe('hybrid');
  });

  it('normalizes a scalar seniority string', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        postings: [{ ...fixture.postings[0], seniority: 'Mid' }],
      }),
    );

    const vacancies = await collector.collect();

    expect(vacancies[0].seniority).toBe('mid');
  });

  it('tolerates postings with missing fields', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ postings: [{}, fixture.postings[0]] }),
    );

    const vacancies = await collector.collect();

    expect(vacancies).toHaveLength(2);
    expect(vacancies[0]).toMatchObject({
      source: 'nofluffjobs',
      rawText: '',
      remote: 'onsite',
      seniority: 'unknown',
    });
    expect(vacancies[0].url).toBeUndefined();
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
