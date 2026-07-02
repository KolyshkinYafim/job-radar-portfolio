import { Injectable } from '@nestjs/common';
import type { RawVacancy, Seniority } from '../../common/types';
import { BaseHttpCollector } from '../base-http.collector';

const BASE_URL = 'https://api.hirify.me/api/vacancies';
const PUBLIC_BASE_URL = 'https://hirify.me/jobs';

interface HirifyTag {
  id?: number;
  name?: string;
}

interface HirifySpecialization {
  id?: number;
  code?: string;
  name?: string;
  name_en?: string;
}

interface HirifyGrade {
  id?: number;
  name?: string;
}

interface HirifySalary {
  currency?: string | null;
  min?: number | null;
  max?: number | null;
}

interface HirifyVacancy {
  id?: number;
  title?: string;
  slug?: string;
  company_title?: string;
  work_format?: string[];
  work_type?: string;
  tags?: HirifyTag[];
  salary?: HirifySalary | null;
  specializations?: HirifySpecialization[];
  grades?: HirifyGrade[];
  created_at?: string;
  source?: string;
}

interface HirifyResponse {
  data?: HirifyVacancy[];
  current_page?: number;
  last_page?: number;
  total?: number;
}

const GRADE_MAP: Record<string, Seniority> = {
  senior: 'senior',
  lead: 'lead',
  старший: 'senior',
  middle: 'mid',
  средний: 'mid',
  junior: 'junior',
  младший: 'junior',
};

function deriveSeniority(grades: HirifyGrade[] | undefined): Seniority {
  for (const grade of grades ?? []) {
    const mapped = GRADE_MAP[grade.name?.trim().toLowerCase() ?? ''];
    if (mapped) return mapped;
  }
  return 'unknown';
}

function resolveCompany(companyTitle: string | undefined): string | undefined {
  if (!companyTitle) return undefined;
  if (companyTitle.startsWith('%') && companyTitle.endsWith('%')) {
    return undefined;
  }
  return companyTitle;
}

function normalizeTags(tags: HirifyTag[] | undefined): string[] {
  return (tags ?? [])
    .map((tag) => tag.name)
    .filter((name): name is string => Boolean(name));
}

function normalizeSpecializations(
  specializations: HirifySpecialization[] | undefined,
): string[] {
  return (specializations ?? [])
    .map((spec) => spec.name_en ?? spec.name)
    .filter((name): name is string => Boolean(name));
}

@Injectable()
export class HirifyCollector extends BaseHttpCollector {
  readonly name = 'hirify';

  async collect(): Promise<RawVacancy[]> {
    const data = await this.fetchJson<HirifyResponse>(
      `${BASE_URL}?per_page=100`,
    );
    if (!data) {
      return [];
    }

    const vacancies = data.data ?? [];
    const remote = vacancies.filter((vacancy) =>
      (vacancy.work_format ?? []).includes('remote'),
    );
    this.logger.log(
      `Hirify: fetched ${vacancies.length} vacancies, ${remote.length} remote`,
    );

    return remote.map((vacancy): RawVacancy => {
      const company = resolveCompany(vacancy.company_title);
      const tags = normalizeTags(vacancy.tags);
      const specializations = normalizeSpecializations(vacancy.specializations);
      const stack = [...new Set([...specializations, ...tags])];

      return {
        source: 'hirify',
        externalId: vacancy.id !== undefined ? String(vacancy.id) : undefined,
        url: vacancy.slug
          ? `${PUBLIC_BASE_URL}/${vacancy.slug}`
          : 'https://hirify.me/',
        title: vacancy.title,
        company,
        rawText: [vacancy.title, company, ...tags, ...specializations]
          .filter(Boolean)
          .join('\n\n'),
        salaryMin: vacancy.salary?.min ?? undefined,
        salaryMax: vacancy.salary?.max ?? undefined,
        currency: vacancy.salary?.currency ?? undefined,
        stack,
        remote: 'remote-global',
        seniority: deriveSeniority(vacancy.grades),
        postedAt: vacancy.created_at ? new Date(vacancy.created_at) : undefined,
      };
    });
  }
}
