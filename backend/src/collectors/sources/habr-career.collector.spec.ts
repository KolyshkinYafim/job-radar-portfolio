import { readFileSync } from 'fs';
import { join } from 'path';
import { HabrCareerCollector } from './habr-career.collector';

const fixture = JSON.parse(
  readFileSync(
    join(__dirname, 'fixtures', 'habr-career-vacancies.json'),
    'utf8',
  ),
) as { list: Record<string, unknown>[] };

const jsonResponse = (body: unknown): Response =>
  ({ ok: true, status: 200, json: () => Promise.resolve(body) }) as Response;

describe('HabrCareerCollector', () => {
  let collector: HabrCareerCollector;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    collector = new HabrCareerCollector();
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('maps remote vacancies to RawVacancy with salary, stack and seniority', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(fixture));

    const vacancies = await collector.collect();

    expect(vacancies).toHaveLength(2);

    const [senior, middle] = vacancies;

    expect(senior).toMatchObject({
      source: 'habr.career',
      externalId: '1000166290',
      url: 'https://career.habr.com/vacancies/1000166290',
      title: 'Старший инженер по автоматизации тестирования / Senior AQA',
      company: 'Хайтек',
      remote: 'remote-global',
      seniority: 'senior',
      salaryMin: 260000,
      salaryMax: 380000,
      currency: 'RUR',
    });
    expect(senior.stack).toEqual(['Python', 'Selenium', 'CI/CD']);
    expect(senior.postedAt).toEqual(new Date('2026-06-15T16:52:22+03:00'));
    expect(senior.rawText).toContain('Хайтек');
    expect(senior.rawText).toContain('Python');
    expect(senior.rawText).toContain('от 260 000 до 380 000 ₽');

    expect(middle).toMatchObject({
      source: 'habr.career',
      externalId: '1000166291',
      seniority: 'mid',
      remote: 'remote-global',
    });
    expect(middle.stack).toEqual(['React', 'TypeScript', 'Redux']);
    expect(middle.salaryMin).toBeUndefined();
    expect(middle.salaryMax).toBeUndefined();
    expect(middle.currency).toBeUndefined();
  });

  it('excludes vacancies where remoteWork is false', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(fixture));

    const vacancies = await collector.collect();

    expect(vacancies.every((v) => v.remote === 'remote-global')).toBe(true);
    expect(
      vacancies.find((v) => v.externalId === '1000166292'),
    ).toBeUndefined();
    expect(vacancies.map((v) => v.externalId)).toEqual([
      '1000166290',
      '1000166291',
    ]);
  });

  it('normalizes string-array skills', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        list: [
          {
            id: 42,
            href: '/vacancies/42',
            title: 'Go Engineer',
            remoteWork: true,
            qualification: 'Junior',
            skills: ['Go', 'PostgreSQL'],
          },
        ],
      }),
    );

    const vacancies = await collector.collect();

    expect(vacancies).toHaveLength(1);
    expect(vacancies[0].stack).toEqual(['Go', 'PostgreSQL']);
    expect(vacancies[0].seniority).toBe('junior');
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
