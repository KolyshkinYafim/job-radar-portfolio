import { readFileSync } from 'fs';
import { join } from 'path';
import { WorkingNomadsCollector } from './workingnomads.collector';

const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'workingnomads-jobs.json'), 'utf8'),
) as Record<string, unknown>[];

const jsonResponse = (body: unknown): Response =>
  ({ ok: true, status: 200, json: () => Promise.resolve(body) }) as Response;

describe('WorkingNomadsCollector', () => {
  let collector: WorkingNomadsCollector;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    collector = new WorkingNomadsCollector();
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('maps jobs to RawVacancy and normalizes comma-separated tags', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(fixture));

    const vacancies = await collector.collect();

    expect(vacancies).toHaveLength(2);

    const [first, second] = vacancies;

    expect(first).toMatchObject({
      source: 'workingnomads',
      externalId: '1663269',
      url: 'https://www.workingnomads.com/job/go/1663269/',
      title: 'Senior React Native Developer',
      company: 'Lemon.io',
      remote: 'remote-global',
    });
    expect(first.stack).toEqual([
      'react native',
      'react',
      'nodejs',
      'communication',
      'english',
    ]);
    expect(first.postedAt).toEqual(new Date('2026-06-12T11:32:31-04:00'));
    expect(first.rawText).toContain('Lemon.io');
    expect(first.rawText).toContain('build mobile apps for hand-picked');
    expect(first.rawText).not.toContain('<p>');
    expect(first.salaryMin).toBeUndefined();
    expect(first.salaryMax).toBeUndefined();
    expect(first.currency).toBeUndefined();

    expect(second).toMatchObject({
      source: 'workingnomads',
      externalId: '1663270',
      title: 'Backend Python Engineer',
      company: 'Hooli',
    });
    expect(second.stack).toEqual(['python', 'django', 'postgresql']);
  });

  it('falls back to the url when no numeric id is present', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        { ...fixture[0], url: 'https://www.workingnomads.com/jobs/odd-slug' },
      ]),
    );

    const vacancies = await collector.collect();

    expect(vacancies[0].externalId).toBe(
      'https://www.workingnomads.com/jobs/odd-slug',
    );
  });

  it('tolerates jobs with missing fields', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([{}, fixture[0]]));

    const vacancies = await collector.collect();

    expect(vacancies).toHaveLength(2);
    expect(vacancies[0]).toMatchObject({
      source: 'workingnomads',
      rawText: '',
      remote: 'remote-global',
    });
    expect(vacancies[0].stack).toEqual([]);
    expect(vacancies[0].externalId).toBeUndefined();
    expect(vacancies[0].postedAt).toBeUndefined();
    expect(vacancies[1].title).toBe('Senior React Native Developer');
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
