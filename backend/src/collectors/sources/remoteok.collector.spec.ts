import { readFileSync } from 'fs';
import { join } from 'path';
import { RemoteOkCollector } from './remoteok.collector';

const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'remoteok-jobs.json'), 'utf8'),
) as unknown;

const jsonResponse = (body: unknown): Response =>
  ({ ok: true, status: 200, json: () => Promise.resolve(body) }) as Response;

describe('RemoteOkCollector', () => {
  let collector: RemoteOkCollector;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    collector = new RemoteOkCollector();
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('skips the legal notice, filters by tags and maps jobs to RawVacancy', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(fixture));

    const vacancies = await collector.collect();

    expect(vacancies).toHaveLength(2);
    expect(vacancies.map((v) => v.externalId)).toEqual(['1133077', '1133105']);

    const [withSalary, euLocated] = vacancies;

    expect(withSalary).toMatchObject({
      source: 'remoteok',
      externalId: '1133077',
      url: 'https://remoteOK.com/remote-jobs/remote-principal-operations-engineer-hardware-data-center-operations-fluidstack-1133077',
      company: 'Fluidstack',
      salaryMin: 150000,
      salaryMax: 250000,
      currency: 'USD',
      remote: 'remote-global',
    });
    expect(withSalary.title).toContain('Principal Operations Engineer');
    expect(withSalary.stack).toContain('dev');
    expect(withSalary.postedAt).toEqual(new Date('2026-06-09T16:00:04+00:00'));
    expect(withSalary.rawText.length).toBeGreaterThan(0);
    expect(withSalary.rawText).not.toMatch(/<[a-z/][^>]*>/i);

    expect(euLocated).toMatchObject({
      source: 'remoteok',
      externalId: '1133105',
      title: 'Clinical Coordinator',
      company: 'Enable Dental',
      remote: 'remote-eu',
    });
    expect(euLocated.salaryMin).toBeUndefined();
    expect(euLocated.salaryMax).toBeUndefined();
    expect(euLocated.currency).toBeUndefined();
    expect(euLocated.rawText).not.toContain('<br>');
  });

  it('sends a browser User-Agent to the API', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(fixture));

    await collector.collect();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://remoteok.com/api',
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': expect.stringContaining('Mozilla/5.0'),
        }),
      }),
    );
  });

  it('tolerates malformed entries in the feed', async () => {
    const jobs = fixture as Record<string, unknown>[];
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        null,
        { id: '1', position: 'Dev', tags: 'broken' },
        jobs[1],
      ]),
    );

    const vacancies = await collector.collect();

    expect(vacancies).toHaveLength(1);
    expect(vacancies[0].externalId).toBe('1133077');
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
