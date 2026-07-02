import { readFileSync } from 'fs';
import { join } from 'path';
import { AshbyCollector } from './ashby.collector';

const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'ashby-jobs.json'), 'utf8'),
) as unknown;

const jsonResponse = (body: unknown): Response =>
  ({ ok: true, status: 200, json: () => Promise.resolve(body) }) as Response;

const notFound = (): Response => ({ ok: false, status: 404 }) as Response;

describe('AshbyCollector', () => {
  let collector: AshbyCollector;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    collector = new AshbyCollector();
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('maps listed jobs to RawVacancy with a per-company source', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.includes('/fernbank-labs') ? jsonResponse(fixture) : notFound(),
      ),
    );

    const vacancies = await collector.collect();

    expect(vacancies).toHaveLength(3);
    expect(vacancies.every((v) => v.source === 'ashby/fernbank-labs')).toBe(
      true,
    );

    const security = vacancies.find((v) => v.externalId === 'a1');
    expect(security).toMatchObject({
      title: 'Security Engineer, Cloud',
      company: 'Fernbank-labs',
      url: 'https://jobs.ashbyhq.com/fernbank-labs/a1',
      remote: 'remote-global',
    });

    expect(vacancies.find((v) => v.externalId === 'a2')?.remote).toBe('onsite');
    expect(vacancies.find((v) => v.externalId === 'a3')?.remote).toBe(
      'remote-eu',
    );
  });

  it('returns an empty array when every board responds non-OK', async () => {
    fetchMock.mockResolvedValue(notFound());
    await expect(collector.collect()).resolves.toEqual([]);
  });

  it('returns an empty array when every board request fails', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    await expect(collector.collect()).resolves.toEqual([]);
  });
});
