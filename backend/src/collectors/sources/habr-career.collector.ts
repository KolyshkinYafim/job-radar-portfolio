import { Injectable } from '@nestjs/common';
import type { RawVacancy, Seniority } from '../../common/types';
import { BaseHttpCollector } from '../base-http.collector';

const BASE_URL = 'https://career.habr.com/api/frontend/vacancies';

interface HabrSkill {
  title?: string;
}

interface HabrSalary {
  from?: number | null;
  to?: number | null;
  currency?: string | null;
  formatted?: string | null;
}

interface HabrVacancy {
  id?: number;
  href?: string;
  title?: string;
  remoteWork?: boolean;
  salaryQualification?: { title?: string };
  qualification?: string;
  publishedDate?: { date?: string };
  company?: { title?: string; href?: string };
  salary?: HabrSalary;
  skills?: (HabrSkill | string)[];
}

interface HabrResponse {
  list?: HabrVacancy[];
}

function deriveSeniority(...values: (string | undefined)[]): Seniority {
  const text = values.filter(Boolean).join(' ').toLowerCase();
  if (/старший|lead|senior/.test(text)) return 'senior';
  if (/средний|middle/.test(text)) return 'mid';
  if (/младший|junior|intern|стаж/.test(text)) return 'junior';
  return 'unknown';
}

function normalizeSkills(skills: (HabrSkill | string)[] | undefined): string[] {
  if (!skills) return [];
  return skills
    .map((skill) => (typeof skill === 'string' ? skill : skill.title))
    .filter((title): title is string => Boolean(title));
}

function mapSalary(salary: HabrSalary | undefined): {
  min?: number;
  max?: number;
  currency?: string;
} {
  if (!salary) return {};
  const min = salary.from ?? undefined;
  const max = salary.to ?? undefined;
  if (min === undefined && max === undefined) return {};
  const currency = salary.currency ? salary.currency.toUpperCase() : undefined;
  return { min, max, currency };
}

@Injectable()
export class HabrCareerCollector extends BaseHttpCollector {
  readonly name = 'habr.career';

  async collect(): Promise<RawVacancy[]> {
    const data = await this.fetchJson<HabrResponse>(
      `${BASE_URL}?per_page=100&type=all&sort=date`,
    );
    if (!data) {
      return [];
    }

    const list = data.list ?? [];
    const remote = list.filter((job) => job.remoteWork === true);
    this.logger.log(
      `Habr Career: fetched ${list.length} jobs, ${remote.length} remote`,
    );

    return remote.map((job): RawVacancy => {
      const skills = normalizeSkills(job.skills);
      const salary = mapSalary(job.salary);
      return {
        source: 'habr.career',
        externalId: String(job.id),
        title: job.title,
        url: `https://career.habr.com${job.href}`,
        company: job.company?.title,
        remote: 'remote-global',
        seniority: deriveSeniority(
          job.qualification,
          job.salaryQualification?.title,
        ),
        stack: skills,
        salaryMin: salary.min,
        salaryMax: salary.max,
        currency: salary.currency,
        rawText: [
          job.title,
          job.company?.title,
          ...skills,
          job.salary?.formatted,
        ]
          .filter(Boolean)
          .join('\n\n'),
        postedAt: job.publishedDate?.date
          ? new Date(job.publishedDate.date)
          : undefined,
      };
    });
  }
}
