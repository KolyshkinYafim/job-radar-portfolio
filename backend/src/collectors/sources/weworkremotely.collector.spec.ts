import { readFileSync } from 'fs';
import { join } from 'path';
import { WeWorkRemotelyCollector } from './weworkremotely.collector';

const fixtureXml = readFileSync(
  join(__dirname, 'fixtures', 'weworkremotely-programming.xml'),
  'utf8',
);

const xmlResponse = (body: string): Response =>
  ({ ok: true, status: 200, text: () => Promise.resolve(body) }) as Response;

describe('WeWorkRemotelyCollector', () => {
  let collector: WeWorkRemotelyCollector;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    collector = new WeWorkRemotelyCollector();
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('parses the RSS feed and maps items to RawVacancy', async () => {
    fetchMock.mockResolvedValueOnce(xmlResponse(fixtureXml));

    const vacancies = await collector.collect();

    expect(vacancies).toHaveLength(3);

    const [stellar, nomad, chiefRebel] = vacancies;

    expect(stellar).toMatchObject({
      source: 'wwr',
      externalId:
        'https://weworkremotely.com/remote-jobs/stellar-ai-senior-software-engineer',
      url: 'https://weworkremotely.com/remote-jobs/stellar-ai-senior-software-engineer',
      title: 'Senior Software Engineer',
      company: 'Stellar AI',
      remote: 'remote-global',
    });
    expect(stellar.postedAt).toEqual(
      new Date('Tue, 21 Oct 2025 19:36:26 +0000'),
    );
    expect(stellar.rawText).toContain(
      'We are seeking experienced Software Engineers',
    );
    expect(stellar.rawText).not.toMatch(/<[a-z/][^>]*>/i);

    expect(nomad).toMatchObject({
      source: 'wwr',
      title: 'Senior Software Engineer II',
      company: 'Nomad',
      remote: 'remote-global',
    });

    expect(chiefRebel).toMatchObject({
      source: 'wwr',
      externalId:
        'https://weworkremotely.com/remote-jobs/chief-rebel-full-stack-engineer-ai-forward',
      title: 'Full Stack Engineer (AI-Forward)',
      company: 'Chief Rebel',
      remote: 'remote-eu',
    });
  });

  it('keeps the full title when there is no company separator', async () => {
    const xml = fixtureXml.replace(
      '<title>Stellar AI: Senior Software Engineer</title>',
      '<title>Senior Software Engineer</title>',
    );
    fetchMock.mockResolvedValueOnce(xmlResponse(xml));

    const vacancies = await collector.collect();

    expect(vacancies[0].title).toBe('Senior Software Engineer');
    expect(vacancies[0].company).toBeUndefined();
  });

  it('handles a feed with a single item', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <item>
    <title>Acme: Backend Engineer</title>
    <region>Anywhere in the World</region>
    <description>&lt;p&gt;Build &amp;amp; ship APIs&lt;/p&gt;</description>
    <pubDate>Tue, 19 May 2026 15:45:54 +0000</pubDate>
    <guid>https://weworkremotely.com/remote-jobs/acme-backend-engineer</guid>
    <link>https://weworkremotely.com/remote-jobs/acme-backend-engineer</link>
  </item>
</channel></rss>`;
    fetchMock.mockResolvedValueOnce(xmlResponse(xml));

    const vacancies = await collector.collect();

    expect(vacancies).toHaveLength(1);
    expect(vacancies[0]).toMatchObject({
      title: 'Backend Engineer',
      company: 'Acme',
      rawText: 'Build & ship APIs',
    });
  });

  it('skips items without a title but keeps the rest', async () => {
    const xml = fixtureXml.replace(
      '<title>Stellar AI: Senior Software Engineer</title>',
      '<title></title>',
    );
    fetchMock.mockResolvedValueOnce(xmlResponse(xml));

    const vacancies = await collector.collect();

    expect(vacancies).toHaveLength(2);
    expect(vacancies.map((v) => v.company)).toEqual(['Nomad', 'Chief Rebel']);
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
