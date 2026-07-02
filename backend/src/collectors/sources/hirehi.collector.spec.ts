import { readFileSync } from 'fs';
import { join } from 'path';
import { HirehiCollector } from './hirehi.collector';

const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'hirehi-jobs.json'), 'utf8'),
) as { jobs: Record<string, unknown>[] };

const jsonResponse = (body: unknown): Response =>
  ({ ok: true, status: 200, json: () => Promise.resolve(body) }) as Response;

describe('HirehiCollector', () => {
  let collector: HirehiCollector;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    collector = new HirehiCollector();
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('exposes the hirehi name', () => {
    expect(collector.name).toBe('hirehi');
  });

  it('emits only удалённо jobs and excludes офис and гибрид', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(fixture));

    const vacancies = await collector.collect();

    expect(vacancies).toHaveLength(2);
    const ids = vacancies.map((v) => v.externalId);
    expect(ids).toEqual(['52461', '52390']);
    expect(ids).not.toContain('52400');
    expect(ids).not.toContain('52380');
    expect(vacancies.every((v) => v.remote === 'remote-global')).toBe(true);
  });

  it('maps a remote job to RawVacancy with the public job URL pattern', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(fixture));

    const [first] = await collector.collect();

    expect(first).toMatchObject({
      source: 'hirehi',
      externalId: '52461',
      url: 'https://hirehi.ru/analytics/job-52461',
      title: 'Business Analyst',
      company: 'Лоция',
      remote: 'remote-global',
      seniority: 'senior',
      salaryMin: 250000,
      currency: 'RUB',
    });
    expect(first.salaryMax).toBeUndefined();
    expect(first.postedAt).toEqual(new Date('2026-06-15T14:06:57Z'));
    expect(first.rawText).toContain('Business Analyst');
    expect(first.rawText).toContain('analytics');
    expect(first.rawText).toContain('от 250 000 ₽');
  });

  it('keeps NDA companies and derives seniority and salary ranges', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(fixture));

    const vacancies = await collector.collect();
    const junior = vacancies.find((v) => v.externalId === '52390');

    expect(junior).toMatchObject({
      seniority: 'junior',
      salaryMin: 100000,
      salaryMax: 150000,
      currency: 'RUB',
    });
  });

  it('keeps the NDA company value as-is when present', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        jobs: [
          {
            id: 1,
            title: 'Engineer',
            company: 'NDA',
            format: 'удалённо',
            level: 'middle',
          },
        ],
      }),
    );

    const [vacancy] = await collector.collect();

    expect(vacancy.company).toBe('NDA');
    expect(vacancy.seniority).toBe('mid');
    expect(vacancy.salaryMin).toBeUndefined();
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
