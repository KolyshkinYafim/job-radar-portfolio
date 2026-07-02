import { readFileSync } from 'fs';
import { join } from 'path';
import { JustJoinCollector } from './justjoin.collector';

const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'justjoin-offers.json'), 'utf8'),
) as unknown;

const jsonResponse = (body: unknown): Response =>
  ({ ok: true, status: 200, json: () => Promise.resolve(body) }) as Response;

describe('JustJoinCollector', () => {
  let collector: JustJoinCollector;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    collector = new JustJoinCollector();
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('maps offers from the by-cursor API to RawVacancy', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(fixture));

    const vacancies = await collector.collect();

    expect(vacancies).toHaveLength(3);

    const [first, second, third] = vacancies;

    expect(first).toMatchObject({
      source: 'justjoin',
      externalId:
        'codetwo-sp-z-o-o-sp-k--web-developer-jelenia-gora-javascript',
      url: 'https://justjoin.it/job-offer/codetwo-sp-z-o-o-sp-k--web-developer-jelenia-gora-javascript',
      title: 'Web Developer',
      company: 'CodeTwo sp. z o.o. sp. k.',
      salaryMin: 10000,
      salaryMax: 17000,
      currency: 'PLN',
      remote: 'remote-eu',
      seniority: 'mid',
    });
    expect(first.stack).toEqual([
      'CSS',
      'JavaScript',
      'Visual Studio',
      'C#',
      'React',
      'Azure',
      'ASP.NET',
    ]);
    expect(first.postedAt).toEqual(new Date('2026-06-10T13:00:20.203Z'));
    expect(first.rawText).toContain(
      'Web Developer at CodeTwo sp. z o.o. sp. k.',
    );
    expect(first.rawText).toContain('Skills: CSS, JavaScript');
    expect(first.rawText).toContain(
      'Salary: 10000-17000 PLN/month (permanent)',
    );

    expect(second).toMatchObject({
      source: 'justjoin',
      title: 'Senior Fullstack Developer',
      company: 'Framna (formerly Bright Inventions)',
      salaryMin: 25000,
      salaryMax: 28000,
      currency: 'PLN',
      remote: 'hybrid',
      seniority: 'senior',
    });
    expect(second.stack).toContain('TypeScript');

    expect(third).toMatchObject({
      source: 'justjoin',
      title: 'Senior Frontend Engineer',
      company: 'emagine Polska',
      remote: 'onsite',
      seniority: 'senior',
    });
    expect(third.salaryMin).toBeUndefined();
    expect(third.salaryMax).toBeUndefined();
    expect(third.currency).toBeUndefined();
    expect(third.stack).toBeUndefined();
  });

  it('requests the JavaScript category sorted by publication date', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(fixture));

    await collector.collect();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('api.justjoin.it/v2/user-panel/offers/by-cursor');
    expect(url).toContain('categories[]=1');
    expect(url).toContain('from=0');
  });

  it('fetches a second page when the first page is full', async () => {
    const offer = (fixture as { data: unknown[] }).data[0];
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: Array(20).fill(offer) }))
      .mockResolvedValueOnce(jsonResponse({ data: [offer] }));

    const vacancies = await collector.collect();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain('from=20');
    expect(vacancies).toHaveLength(21);
  });

  it('skips malformed offers without dropping the batch', async () => {
    const offer = (fixture as { data: unknown[] }).data[0];
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: [{ slug: '', title: '' }, offer] }),
    );

    const vacancies = await collector.collect();

    expect(vacancies).toHaveLength(1);
    expect(vacancies[0].title).toBe('Web Developer');
  });

  it('returns an empty array when the API is unreachable', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    await expect(collector.collect()).resolves.toEqual([]);
  });

  it('returns an empty array on a non-OK response', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });

    await expect(collector.collect()).resolves.toEqual([]);
  });
});
