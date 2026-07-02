import { readFileSync } from 'fs';
import { join } from 'path';
import { JobicyCollector } from './jobicy.collector';

const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'jobicy-jobs.json'), 'utf8'),
) as { jobs: Record<string, unknown>[] };

const worldwideJob = {
  id: 145002,
  url: 'https://jobicy.com/jobs/145002-go-developer',
  jobSlug: '145002-go-developer',
  jobTitle: 'Go Developer',
  companyName: 'Acme',
  jobIndustry: ['Backend'],
  jobGeo: 'Anywhere',
  jobLevel: 'Any',
  jobExcerpt: 'Write fast services.',
  pubDate: '2026-06-09T08:00:00',
  salaryMin: 5000,
  salaryMax: 7000,
  salaryCurrency: 'EUR',
  salaryPeriod: 'month',
};

const jsonResponse = (body: unknown): Response =>
  ({ ok: true, status: 200, json: () => Promise.resolve(body) }) as Response;

describe('JobicyCollector', () => {
  let collector: JobicyCollector;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    collector = new JobicyCollector();
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('maps jobs from both geo feeds to RawVacancy', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(fixture))
      .mockResolvedValueOnce(jsonResponse({ jobs: [worldwideJob] }));

    const vacancies = await collector.collect();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('geo=europe');
    expect(fetchMock.mock.calls[1][0]).toContain('geo=worldwide');
    expect(vacancies).toHaveLength(2);

    const [euJob, globalJob] = vacancies;

    expect(euJob).toMatchObject({
      source: 'jobicy',
      externalId: '145001',
      url: 'https://jobicy.com/jobs/145001-senior-react-developer',
      title: 'Senior React Developer',
      company: 'Veeva',
      salaryMin: 5000,
      salaryMax: 7000,
      currency: 'USD',
      remote: 'remote-eu',
      seniority: 'senior',
    });
    expect(euJob.stack).toEqual(['Web & App Development']);
    expect(euJob.postedAt).toEqual(new Date('2026-06-08T11:30:14'));
    expect(euJob.rawText).toContain('Build delightful UIs');
    expect(euJob.rawText).toContain('strong TypeScript skills');

    expect(globalJob).toMatchObject({
      source: 'jobicy',
      externalId: '145002',
      title: 'Go Developer',
      company: 'Acme',
      salaryMin: 5000,
      salaryMax: 7000,
      currency: 'EUR',
      remote: 'remote-global',
      seniority: 'unknown',
    });
  });

  it('keeps collecting when one geo feed fails', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(jsonResponse(fixture));

    const vacancies = await collector.collect();

    expect(vacancies).toHaveLength(1);
    expect(vacancies[0].externalId).toBe('145001');
  });

  it('tolerates jobs with missing fields', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ jobs: [{}] }))
      .mockResolvedValueOnce(jsonResponse({ jobs: [] }));

    const vacancies = await collector.collect();

    expect(vacancies).toHaveLength(1);
    expect(vacancies[0]).toMatchObject({ source: 'jobicy', rawText: '' });
  });

  it('returns an empty array when every feed is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(collector.collect()).resolves.toEqual([]);
  });

  it('returns an empty array on non-OK responses', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await expect(collector.collect()).resolves.toEqual([]);
  });
});
