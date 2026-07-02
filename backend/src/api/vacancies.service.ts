import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { VacancyStatus } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';

const GOLDEN_LABELS = ['yes', 'maybe', 'no'] as const;
export type GoldenLabel = (typeof GOLDEN_LABELS)[number];

export interface VacancyListQuery {
  page?: number;
  limit?: number;
  status?: string;
  applicationStatus?: string;
  minScore?: number;
  search?: string;
  source?: string;
}

@Injectable()
export class VacanciesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, q: VacancyListQuery) {
    const page = Math.max(1, q.page ?? 1);
    const limit = Math.min(100, Math.max(1, q.limit ?? 50));
    const skip = (page - 1) * limit;

    const where: Prisma.UserMatchWhereInput = { userId };
    if (q.minScore && Number(q.minScore) > 0) {
      where.score = { gte: Number(q.minScore) };
    }
    if (q.applicationStatus !== undefined && q.applicationStatus !== '') {
      where.appStatus =
        q.applicationStatus === 'null' ? null : q.applicationStatus;
    }

    const vacancyWhere: Prisma.VacancyWhereInput = {};
    if (q.status) vacancyWhere.status = q.status;
    if (q.source) vacancyWhere.source = q.source;
    if (q.search) {
      vacancyWhere.OR = [
        { title: { contains: q.search, mode: 'insensitive' } },
        { company: { contains: q.search, mode: 'insensitive' } },
      ];
    }
    if (Object.keys(vacancyWhere).length) {
      where.vacancy = vacancyWhere;
    }

    const [total, matches] = await Promise.all([
      this.prisma.userMatch.count({ where }),
      this.prisma.userMatch.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
        include: {
          vacancy: {
            select: {
              id: true,
              title: true,
              company: true,
              source: true,
              url: true,
              salaryMin: true,
              salaryMax: true,
              currency: true,
              remote: true,
              seniority: true,
              stack: true,
              status: true,
              createdAt: true,
              postedAt: true,
            },
          },
        },
      }),
    ]);

    const items = matches.map((m) => ({
      ...m.vacancy,
      applicationStatus: m.appStatus,
      score: {
        value: m.score,
        reasonsPro: m.reasonsPro,
        reasonsCon: m.reasonsCon,
        redFlags: m.redFlags,
      },
      feedback: m.verdict ? { verdict: m.verdict } : null,
    }));

    return { total, page, limit, items };
  }

  async findOne(userId: string, id: string) {
    const vacancy = await this.prisma.vacancy.findUnique({
      where: { id },
    });
    if (!vacancy) throw new NotFoundException('Vacancy not found');

    const match = await this.prisma.userMatch.findUnique({
      where: { userId_vacancyId: { userId, vacancyId: id } },
    });

    return {
      ...vacancy,
      applicationStatus: match?.appStatus ?? null,
      score: match
        ? {
            value: match.score,
            location: match.location,
            reasonsPro: match.reasonsPro,
            reasonsCon: match.reasonsCon,
            redFlags: match.redFlags,
            model: match.model,
            createdAt: match.createdAt,
          }
        : null,
      feedback: match?.verdict ? { verdict: match.verdict } : null,
    };
  }

  async updateApplicationStatus(
    userId: string,
    id: string,
    applicationStatus: string,
  ) {
    const vacancy = await this.prisma.vacancy.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!vacancy) throw new NotFoundException('Vacancy not found');

    await this.prisma.userMatch.update({
      where: { userId_vacancyId: { userId, vacancyId: id } },
      data: { appStatus: applicationStatus },
    });

    return this.findOne(userId, id);
  }

  async sources() {
    const rows = await this.prisma.vacancy.groupBy({
      by: ['source'],
      _count: { id: true },
    });
    return rows.map((r) => ({ source: r.source, count: r._count.id }));
  }

  async goldenQueue(userId: string, limit = 50) {
    const unlabeled: Prisma.VacancyWhereInput = {
      goldenLabel: null,
      status: { not: VacancyStatus.FilteredOut },
    };
    const sources = await this.prisma.vacancy.groupBy({
      by: ['source'],
      where: unlabeled,
    });

    const perSource = Math.max(
      1,
      Math.ceil(limit / Math.max(1, sources.length)),
    );
    const items: Array<{
      id: string;
      title: string;
      company: string | null;
      source: string;
      url: string | null;
      rawText: string;
      salaryMin: number | null;
      salaryMax: number | null;
      currency: string | null;
      score: { value: number } | null;
    }> = [];
    for (const { source } of sources) {
      if (items.length >= limit) break;
      const batch = await this.prisma.vacancy.findMany({
        where: { ...unlabeled, source },
        orderBy: { createdAt: 'desc' },
        take: Math.min(perSource, limit - items.length),
        select: {
          id: true,
          title: true,
          company: true,
          source: true,
          url: true,
          rawText: true,
          salaryMin: true,
          salaryMax: true,
          currency: true,
          matches: {
            where: { userId },
            select: { score: true },
            take: 1,
          },
        },
      });
      items.push(
        ...batch.map(({ matches, ...v }) => ({
          ...v,
          score: matches[0] ? { value: matches[0].score } : null,
        })),
      );
    }

    const labeled = await this.prisma.vacancy.count({
      where: { goldenLabel: { not: null } },
    });
    return { labeled, items };
  }

  async setGoldenLabel(id: string, label: string | null) {
    if (label !== null && !GOLDEN_LABELS.includes(label as GoldenLabel)) {
      throw new BadRequestException(
        `label must be one of: ${GOLDEN_LABELS.join(', ')}, or null`,
      );
    }
    const vacancy = await this.prisma.vacancy.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!vacancy) throw new NotFoundException('Vacancy not found');

    return this.prisma.vacancy.update({
      where: { id },
      data: { goldenLabel: label },
      select: { id: true, goldenLabel: true },
    });
  }
}
