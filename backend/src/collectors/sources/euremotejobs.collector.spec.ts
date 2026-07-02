import { readFileSync } from 'fs';
import { join } from 'path';
import { EuRemoteJobsCollector } from './euremotejobs.collector';

const fixtureXml = readFileSync(
  join(__dirname, 'fixtures', 'euremotejobs-feed.xml'),
  'utf8',
);

const xmlResponse = (body: string): Response =>
  ({ ok: true, status: 200, text: () => Promise.resolve(body) }) as Response;

describe('EuRemoteJobsCollector', () => {
  let collector: EuRemoteJobsCollector;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    collector = new EuRemoteJobsCollector();
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('parses the WP Job Manager feed into RawVacancy', async () => {
    fetchMock.mockResolvedValueOnce(xmlResponse(fixtureXml));

    const vacancies = await collector.collect();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://euremotejobs.com/?feed=job_feed',
      expect.anything(),
    );
    expect(vacancies).toHaveLength(2);

    const [backend] = vacancies;

    expect(backend).toMatchObject({
      source: 'euremotejobs',
      externalId: 'https://euremotejobs.com/job/senior-backend-engineer/',
      url: 'https://euremotejobs.com/job/senior-backend-engineer/',
      title: 'Senior Backend Engineer',
      company: 'Acme',
      remote: 'remote-eu',
    });
    expect(backend.postedAt).toEqual(
      new Date('Wed, 17 Jun 2026 09:22:09 +0000'),
    );
    expect(backend.rawText).toContain('Node.js');
    expect(backend.rawText).not.toMatch(/<[a-z/][^>]*>/i);
  });

  it('falls back to dc:creator when job_listing:company is absent', async () => {
    fetchMock.mockResolvedValueOnce(xmlResponse(fixtureXml));

    const vacancies = await collector.collect();

    expect(vacancies[1]).toMatchObject({
      title: 'Frontend Developer',
      company: 'Beta Corp',
      remote: 'remote-eu',
    });
  });

  it('returns an empty array when the feed is unreachable', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    await expect(collector.collect()).resolves.toEqual([]);
  });

  it('returns an empty array on a non-OK response', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(collector.collect()).resolves.toEqual([]);
  });
});
