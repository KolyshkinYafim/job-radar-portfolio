import { readFileSync } from 'fs';
import { join } from 'path';
import { JustRemoteCollector } from './justremote.collector';

const fixtureHtml = readFileSync(
  join(__dirname, 'fixtures', 'justremote-home.html'),
  'utf8',
);

const htmlResponse = (body: string): Response =>
  ({ ok: true, status: 200, text: () => Promise.resolve(body) }) as Response;

describe('JustRemoteCollector', () => {
  let collector: JustRemoteCollector;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    collector = new JustRemoteCollector();
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('extracts jobs from __PRELOADED_STATE__ and skips inactive ones', async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse(fixtureHtml));

    const vacancies = await collector.collect();

    expect(vacancies).toHaveLength(2);

    const [you, gitlab] = vacancies;

    expect(you).toMatchObject({
      source: 'justremote',
      externalId: '24166',
      title: 'Senior AI Engineer',
      company: 'You.com',
      url: 'https://justremote.co/remote-developer-jobs/senior-ai-engineer-you-com',
      remote: 'remote-global',
    });

    expect(gitlab).toMatchObject({
      title: 'Lead Backend Engineer',
      company: 'Gitlab',
      remote: 'remote-eu',
    });
  });

  it('returns an empty array when state is missing', async () => {
    fetchMock.mockResolvedValueOnce(
      htmlResponse('<html><body>nope</body></html>'),
    );
    await expect(collector.collect()).resolves.toEqual([]);
  });

  it('returns an empty array on failure', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    await expect(collector.collect()).resolves.toEqual([]);
  });
});
