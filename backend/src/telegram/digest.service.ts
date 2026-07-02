import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { getOwnerUserId } from '../auth/current-user.helper';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from './telegram.service';
import { escapeHtml } from './telegram-card.formatter';

const GRAY_ZONE_MIN = 50;
const DIGEST_WINDOW_MS = 24 * 60 * 60 * 1000;
const DIGEST_LIMIT = 10;

@Injectable()
export class DigestService {
  private readonly logger = new Logger(DigestService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
  ) {}

  @Cron('0 9 * * *')
  async sendGrayZoneDigest(): Promise<void> {
    try {
      const userId = getOwnerUserId(this.configService);
      const threshold =
        this.configService.get<number>('scoringThreshold') ?? 65;
      const since = new Date(Date.now() - DIGEST_WINDOW_MS);

      const matches = await this.prisma.userMatch.findMany({
        where: {
          userId,
          createdAt: { gte: since },
          score: { gte: GRAY_ZONE_MIN, lt: threshold },
        },
        include: {
          vacancy: {
            select: { id: true, title: true, company: true, url: true },
          },
        },
        orderBy: { score: 'desc' },
        take: DIGEST_LIMIT,
      });

      if (!matches.length) {
        return;
      }

      const lines = matches.map((m) => {
        const titleText = escapeHtml(m.vacancy.title);
        const title = m.vacancy.url
          ? `<a href="${escapeHtml(m.vacancy.url)}">${titleText}</a>`
          : titleText;
        const company = m.vacancy.company
          ? ` · ${escapeHtml(m.vacancy.company)}`
          : '';
        return `<b>${m.score}</b> — ${title}${company}`;
      });

      await this.telegram.sendToOwner(
        `🌫 Gray zone (${GRAY_ZONE_MIN}–${threshold - 1}) — last 24h:\n\n${lines.join('\n')}`,
      );
      this.logger.log(`Gray zone digest sent: ${matches.length} vacancies`);
    } catch (error) {
      this.logger.warn(`Gray zone digest failed: ${(error as Error).message}`);
    }
  }
}
