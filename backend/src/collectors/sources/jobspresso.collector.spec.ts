import { readFileSync } from 'fs';
import { join } from 'path';
import { JobspressoCollector } from './jobspresso.collector';

const fixtureXml = readFileSync(
  join(__dirname, 'fixtures', 'jobspresso-feed.xml'),
  'utf8',
);

const xmlResponse = (body: string): Response =>
  ({ ok: true, status: 200, text: () => Promise.resolve(body) }) as Response;

describe('JobspressoCollector', () => {
  let collector: JobspressoCollector;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    collector = new JobspressoCollector();
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('parses the feed and defaults to remote-global', async () => {
    fetchMock.mockResolvedValueOnce(xmlResponse(fixtureXml));

    const vacancies = await collector.collect();

    expect(vacancies).toHaveLength(2);
    expect(vacancies[0]).toMatchObject({
      source: 'jobspresso',
      title: 'Full Stack Engineer',
      company: 'Globex',
      remote: 'remote-global',
    });
    expect(vacancies[0].rawText).toContain('Node.js');
  });

  it('extracts the company from a packed dc:creator string', async () => {
    fetchMock.mockResolvedValueOnce(xmlResponse(fixtureXml));

    const vacancies = await collector.collect();

    expect(vacancies[1]).toMatchObject({
      title: 'DevOps Engineer',
      company: 'Momentum',
      remote: 'remote-global',
    });
  });

  it('returns an empty array on failure', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    await expect(collector.collect()).resolves.toEqual([]);
  });
});
