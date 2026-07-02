import { readFileSync } from 'fs';
import { join } from 'path';
import { HirifyCollector } from './hirify.collector';

const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'hirify-vacancies.json'), 'utf8'),
) as { data: Record<string, unknown>[] };

const jsonResponse = (body: unknown): Response =>
  ({ ok: true, status: 200, json: () => Promise.resolve(body) }) as Response;

describe('HirifyCollector', () => {
  let collector: HirifyCollector;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    collector = new HirifyCollector();
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('emits only vacancies whose work_format includes remote', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(fixture));

    const vacancies = await collector.collect();

    expect(vacancies).toHaveLength(2);
    expect(vacancies.map((v) => v.externalId)).toEqual(['649274', '649268']);
    expect(
      vacancies.find((v) => v.title?.includes('Старший менеджер')),
    ).toBeUndefined();
  });

  it('treats a %...% placeholder company as undefined', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(fixture));

    const vacancies = await collector.collect();
    const placeholder = vacancies.find((v) => v.externalId === '649274');
    const real = vacancies.find((v) => v.externalId === '649268');

    expect(placeholder?.company).toBeUndefined();
    expect(placeholder?.rawText).not.toContain('%hirify_global%');
    expect(real?.company).toBe('Acme Corp');
  });

  it('maps a remote vacancy to RawVacancy with derived fields', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(fixture));

    const vacancies = await collector.collect();
    const senior = vacancies.find((v) => v.externalId === '649274');

    expect(senior).toMatchObject({
      source: 'hirify',
      externalId: '649274',
      url: 'https://hirify.me/jobs/649274-senior-backend-engineer',
      title: 'Senior Backend Engineer',
      remote: 'remote-global',
      seniority: 'senior',
      salaryMin: 73820,
      salaryMax: 96100,
      currency: 'USD',
    });
    expect(senior?.company).toBeUndefined();
    expect(senior?.stack).toEqual(['Backend', 'api', 'databases', 'go']);
    expect(senior?.postedAt).toEqual(new Date('2026-06-15T14:07:23.000000Z'));
    expect(senior?.rawText).toContain('Senior Backend Engineer');
  });

  it('derives seniority from RU grade names and omits an absent salary', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            ...fixture.data[1],
            work_format: ['remote'],
          },
        ],
      }),
    );

    const vacancies = await collector.collect();

    expect(vacancies).toHaveLength(1);
    expect(vacancies[0]).toMatchObject({
      seniority: 'senior',
      company: 'Третьяковская галерея',
    });
    expect(vacancies[0].salaryMin).toBeUndefined();
    expect(vacancies[0].salaryMax).toBeUndefined();
    expect(vacancies[0].currency).toBeUndefined();
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
