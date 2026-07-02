import { readFileSync } from 'fs';
import { join } from 'path';
import { LeverCollector } from './lever.collector';

const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'lever-postings.json'), 'utf8'),
) as Record<string, unknown>[];

const jsonResponse = (body: unknown): Response =>
  ({ ok: true, status: 200, json: () => Promise.resolve(body) }) as Response;

const notFound = (): Response => ({ ok: false, status: 404 }) as Response;

describe('LeverCollector', () => {
  let collector: LeverCollector;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    collector = new LeverCollector();
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('maps postings to RawVacancy with a per-company source', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.includes('/vertex-robotics?') ? jsonResponse(fixture) : notFound(),
      ),
    );

    const vacancies = await collector.collect();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.lever.co/v0/postings/vertex-robotics?mode=json',
      expect.anything(),
    );
    expect(vacancies).toHaveLength(2);

    const [euJob, onsiteJob] = vacancies;

    expect(euJob).toMatchObject({
      source: 'lever/vertex-robotics',
      externalId: 'a1b2c3d4-0001',
      url: 'https://jobs.lever.co/vertex-robotics/a1b2c3d4-0001',
      title: 'Senior Product Engineer',
      company: 'Vertex-robotics',
      remote: 'remote-eu',
    });
    expect(euJob.postedAt).toEqual(new Date(1765400000000));
    expect(euJob.rawText).toContain('Ship features across the stack.');
    expect(euJob.rawText).toContain('Benefits: equity, remote budget.');

    expect(onsiteJob).toMatchObject({
      source: 'lever/vertex-robotics',
      externalId: 'a1b2c3d4-0002',
      title: 'Support Engineer',
      remote: 'onsite',
    });
    expect(onsiteJob.rawText).toContain('Help customers');
    expect(onsiteJob.rawText).not.toContain('<strong>');
  });

  it('keeps collecting when one company board fails', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/vertex-robotics?')) {
        return Promise.resolve(jsonResponse(fixture));
      }
      if (url.includes('/bluepeak-systems?')) {
        return Promise.reject(new Error('network down'));
      }
      return Promise.resolve(notFound());
    });

    const vacancies = await collector.collect();

    expect(vacancies).toHaveLength(2);
    expect(vacancies.every((v) => v.source === 'lever/vertex-robotics')).toBe(
      true,
    );
  });

  it('skips boards that return a non-array payload', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.includes('/vertex-robotics?')
          ? jsonResponse({ error: 'unexpected shape' })
          : notFound(),
      ),
    );

    await expect(collector.collect()).resolves.toEqual([]);
  });

  it('tolerates postings with missing fields', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.includes('/vertex-robotics?')
          ? jsonResponse([{}, fixture[0]])
          : notFound(),
      ),
    );

    const vacancies = await collector.collect();

    expect(vacancies).toHaveLength(2);
    expect(vacancies.map((v) => v.title)).toContain('Senior Product Engineer');
  });

  it('returns an empty array when every board request fails', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(collector.collect()).resolves.toEqual([]);
  });
});
