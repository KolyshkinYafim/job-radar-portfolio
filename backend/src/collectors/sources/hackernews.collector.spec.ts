import { readFileSync } from 'fs';
import { join } from 'path';
import { HackerNewsCollector } from './hackernews.collector';

const search = readFileSync(
  join(__dirname, 'fixtures', 'hackernews-search.json'),
  'utf8',
);
const thread = readFileSync(
  join(__dirname, 'fixtures', 'hackernews-thread.json'),
  'utf8',
);

const jsonResponse = (body: string): Response =>
  ({
    ok: true,
    status: 200,
    json: () => Promise.resolve(JSON.parse(body)),
  }) as Response;

describe('HackerNewsCollector', () => {
  let collector: HackerNewsCollector;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    collector = new HackerNewsCollector();
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('resolves the latest thread and maps top-level comments', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.includes('search_by_date')
          ? jsonResponse(search)
          : jsonResponse(thread),
      ),
    );

    const vacancies = await collector.collect();

    expect(vacancies).toHaveLength(3);

    const [codeweavers, acme, onsite] = vacancies;

    expect(codeweavers).toMatchObject({
      source: 'hackernews',
      externalId: '1001',
      company: 'CodeWeavers',
      url: 'https://codeweavers.com/jobs',
      remote: 'remote-global',
    });
    expect(codeweavers.rawText).not.toMatch(/<[a-z/][^>]*>/i);

    expect(acme).toMatchObject({
      company: 'Acme GmbH',
      remote: 'remote-eu',
    });

    expect(onsite).toMatchObject({
      company: 'Onsite Corp',
      remote: 'onsite',
    });
  });

  it('returns an empty array when no hiring thread is found', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse('{"hits":[]}'));
    await expect(collector.collect()).resolves.toEqual([]);
  });

  it('returns an empty array on failure', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    await expect(collector.collect()).resolves.toEqual([]);
  });
});
