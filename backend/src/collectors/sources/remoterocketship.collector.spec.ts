import { readFileSync } from 'fs';
import { join } from 'path';
import { RemoteRocketshipCollector } from './remoterocketship.collector';

const fixtureHtml = readFileSync(
  join(__dirname, 'fixtures', 'remoterocketship-home.html'),
  'utf8',
);

const htmlResponse = (body: string): Response =>
  ({ ok: true, status: 200, text: () => Promise.resolve(body) }) as Response;

describe('RemoteRocketshipCollector', () => {
  let collector: RemoteRocketshipCollector;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    collector = new RemoteRocketshipCollector();
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('extracts jobs from __NEXT_DATA__ and maps them', async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse(fixtureHtml));

    const vacancies = await collector.collect();

    expect(vacancies).toHaveLength(2);

    const [senior, mid] = vacancies;

    expect(senior).toMatchObject({
      source: 'remoterocketship',
      externalId: '123',
      url: 'https://acme.com/jobs/1',
      title: 'Senior Software Engineer',
      company: 'Acme',
      salaryMin: 120000,
      salaryMax: 160000,
      currency: 'USD',
      remote: 'remote-global',
      seniority: 'senior',
    });
    expect(senior.stack).toEqual(['TypeScript', 'React']);
    expect(senior.rawText).not.toMatch(/<[a-z/][^>]*>/i);

    expect(mid).toMatchObject({
      title: 'Backend Engineer',
      company: 'Globex',
      remote: 'remote-eu',
      seniority: 'mid',
    });
    expect(mid.salaryMin).toBeUndefined();
    expect(mid.currency).toBeUndefined();
  });

  it('returns an empty array when __NEXT_DATA__ is missing', async () => {
    fetchMock.mockResolvedValueOnce(
      htmlResponse('<html><body>no data</body></html>'),
    );
    await expect(collector.collect()).resolves.toEqual([]);
  });

  it('returns an empty array on failure', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    await expect(collector.collect()).resolves.toEqual([]);
  });
});
