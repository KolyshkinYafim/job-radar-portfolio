import { createHash } from 'crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { Bot, Context, InlineKeyboard } from 'grammy';
import { getOwnerUserId } from '../auth/current-user.helper';
import { SCORING_QUEUE, VacancyStatus } from '../common/types';
import type {
  ScoredVacancyView,
  ScoreResult,
  VacancyNotifier,
} from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { UserProfileService } from '../profile/user-profile.service';
import { ScoringService } from '../scoring/scoring.service';
import { userProfileToCandidate } from '../scoring/user-profile.mapper';
import { formatVacancyCard } from './telegram-card.formatter';

@Injectable()
export class TelegramService implements OnModuleInit, VacancyNotifier {
  private readonly logger = new Logger(TelegramService.name);
  private bot: Bot<Context>;
  private readonly whitelist: string;

  constructor(
    private configService: ConfigService,
    private scoringService: ScoringService,
    private prisma: PrismaService,
    private userProfiles: UserProfileService,
    @InjectQueue(SCORING_QUEUE) private scoringQueue: Queue,
  ) {
    const token = this.configService.get<string>('telegram.botToken');
    this.whitelist =
      this.configService.get<string>('telegram.whitelistChatId') ?? '';

    if (!token) {
      this.logger.warn('No TELEGRAM_BOT_TOKEN configured');
      return;
    }

    this.bot = new Bot(token);
    this.setupHandlers();
  }

  async onModuleInit() {
    if (!this.bot) return;

    try {
      await this.bot.api.getMe();
      this.logger.log('Telegram bot initialized');
      void this.bot.start();
      this.logger.log('Bot polling started');
    } catch (e) {
      this.logger.error('Failed to start Telegram bot', e);
    }
  }

  async notifyScored(
    vacancy: ScoredVacancyView,
    score: ScoreResult,
  ): Promise<void> {
    if (!this.bot) throw new Error('Bot not initialized');

    const threshold = this.configService.get<number>('scoringThreshold') ?? 65;
    const card = formatVacancyCard(score, vacancy, threshold);

    const keyboard = new InlineKeyboard()
      .text('👍 Interested', `fb:interested:${vacancy.id}`)
      .text('👎 Pass', `fb:rejected:${vacancy.id}`);

    await this.bot.api.sendMessage(this.whitelist, card, {
      reply_markup: keyboard,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
  }

  async sendToOwner(text: string): Promise<void> {
    if (!this.bot) throw new Error('Bot not initialized');
    await this.bot.api.sendMessage(this.whitelist, text, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
  }

  private setupHandlers() {
    if (!this.bot) return;

    const isAllowed = (ctx: Context) =>
      ctx.chat?.id?.toString() === this.whitelist;

    this.bot.command('start', async (ctx) => {
      if (!isAllowed(ctx)) return;
      await ctx.reply(
        'Job Radar ready.\n\n' +
          '/health — LLM status\n' +
          '/stats — vacancy counts by status\n' +
          '/digest — top scored vacancies\n' +
          '/channels — manage TG channels\n\n' +
          'Or forward/paste a vacancy to score it manually.',
      );
    });

    this.bot.command('health', async (ctx) => {
      if (!isAllowed(ctx)) return;
      const healthy = await this.scoringService.isHealthy();
      await ctx.reply(
        healthy
          ? '✅ LLM is online'
          : '❌ LLM is offline — scoring jobs are queued',
      );
    });

    this.bot.command('stats', async (ctx) => {
      if (!isAllowed(ctx)) return;
      const [counts, queueCounts, llmHealthy] = await Promise.all([
        this.prisma.vacancy.groupBy({ by: ['status'], _count: { id: true } }),
        this.scoringQueue.getJobCounts(
          'waiting',
          'delayed',
          'active',
          'failed',
        ),
        this.scoringService.isHealthy(),
      ]);

      const lines = counts.map((r) => `${r.status}: ${r._count.id}`);
      const queueLine = `queue: ${queueCounts.waiting ?? 0} waiting · ${queueCounts.delayed ?? 0} delayed · ${queueCounts.active ?? 0} active · ${queueCounts.failed ?? 0} failed`;
      const llmLine = llmHealthy ? 'LLM: ✅ online' : 'LLM: ❌ offline';

      await ctx.reply(
        [
          lines.length ? lines.join('\n') : 'No vacancies yet.',
          '',
          queueLine,
          llmLine,
        ].join('\n'),
      );
    });

    this.bot.command('digest', async (ctx) => {
      if (!isAllowed(ctx)) return;
      const userId = getOwnerUserId(this.configService);
      const threshold =
        this.configService.get<number>('scoringThreshold') ?? 65;
      const matches = await this.prisma.userMatch.findMany({
        where: {
          userId,
          score: { gte: threshold },
          vacancy: {
            status: { in: [VacancyStatus.Scored, VacancyStatus.Notified] },
          },
        },
        include: { vacancy: true },
        orderBy: { score: 'desc' },
        take: 5,
      });

      if (!matches.length) {
        await ctx.reply('No scored vacancies above threshold yet.');
        return;
      }

      for (const m of matches) {
        const card = formatVacancyCard(
          {
            score: m.score,
            location: m.location ?? '',
            reasonsPro: m.reasonsPro,
            reasonsCon: m.reasonsCon,
            stackMatch: [],
            redFlags: m.redFlags,
            model: m.model,
            latencyMs: 0,
          },
          {
            id: m.vacancy.id,
            title: m.vacancy.title,
            company: m.vacancy.company,
            url: m.vacancy.url,
            source: m.vacancy.source,
            salaryMin: m.vacancy.salaryMin,
            salaryMax: m.vacancy.salaryMax,
            currency: m.vacancy.currency,
            remote: m.vacancy.remote,
          },
          threshold,
        );
        const keyboard = new InlineKeyboard()
          .text('👍 Interested', `fb:interested:${m.vacancy.id}`)
          .text('👎 Pass', `fb:rejected:${m.vacancy.id}`);

        await ctx.reply(card, {
          reply_markup: keyboard,
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
        });
      }
    });

    this.bot.command('channels', async (ctx) => {
      if (!isAllowed(ctx)) return;
      const args = ctx.message?.text?.split(/\s+/).slice(1) ?? [];
      const [subCmd, handle] = args;

      if (!subCmd || subCmd === 'list') {
        const channels = await this.prisma.channel.findMany({
          where: { kind: 'tg' },
        });
        if (!channels.length) {
          await ctx.reply(
            'No TG channels configured. Use /channels add @handle',
          );
          return;
        }
        const lines = channels.map(
          (c) =>
            `${c.enabled ? '✅' : '⏸'} ${c.handle}${c.lastSeen ? ` (last seen ${c.lastSeen.toISOString().split('T')[0]})` : ''}`,
        );
        await ctx.reply(lines.join('\n'));
        return;
      }

      if (subCmd === 'add') {
        if (!handle?.startsWith('@')) {
          await ctx.reply('Usage: /channels add @handle');
          return;
        }
        await this.prisma.channel.upsert({
          where: { handle },
          create: { kind: 'tg', handle, enabled: true },
          update: { enabled: true },
        });
        await ctx.reply(`✅ Added channel ${handle}`);
        return;
      }

      if (subCmd === 'remove' || subCmd === 'rm') {
        if (!handle?.startsWith('@')) {
          await ctx.reply('Usage: /channels remove @handle');
          return;
        }
        await this.prisma.channel.update({
          where: { handle },
          data: { enabled: false },
        });
        await ctx.reply(`⏸ Disabled channel ${handle}`);
        return;
      }

      await ctx.reply(
        'Unknown subcommand. Usage: /channels [list|add @h|remove @h]',
      );
    });

    this.bot.on('message:text', async (ctx) => {
      if (!isAllowed(ctx)) {
        await ctx.reply('This bot is private.');
        return;
      }

      const text = ctx.message.text;
      if (text.startsWith('/')) return;

      await ctx.reply('Scoring...');

      try {
        const ownerUserId = getOwnerUserId(this.configService);
        const ownerProfile = await this.userProfiles.getByUserId(ownerUserId);
        if (!ownerProfile) {
          this.logger.warn(
            `Owner profile missing for user ${ownerUserId}; manual scoring skipped`,
          );
          await ctx.reply(
            '⚠️ Profile is not set up yet. Open the dashboard Settings tab to fill it in.',
          );
          return;
        }
        const result = await this.scoringService.scoreVacancy(
          { rawText: text },
          userProfileToCandidate(ownerProfile),
          { userId: ownerUserId },
        );
        const threshold =
          this.configService.get<number>('scoringThreshold') ?? 65;
        const title = text.split('\n')[0].slice(0, 120);

        let vacancyId = 'manual';
        try {
          const dedupHash = createHash('sha256')
            .update(`manual:${text.toLowerCase().replace(/\s+/g, ' ').trim()}`)
            .digest('hex');
          const saved = await this.prisma.vacancy.upsert({
            where: { dedupHash },
            create: {
              source: 'manual',
              title,
              rawText: text,
              dedupHash,
              status:
                result.score >= threshold
                  ? VacancyStatus.Notified
                  : VacancyStatus.Scored,
            },
            update: {},
            select: { id: true },
          });
          vacancyId = saved.id;
          await this.prisma.userMatch.upsert({
            where: {
              userId_vacancyId: { userId: ownerUserId, vacancyId },
            },
            create: {
              userId: ownerUserId,
              vacancyId,
              score: result.score,
              location: result.location || null,
              reasonsPro: result.reasonsPro,
              reasonsCon: result.reasonsCon,
              redFlags: result.redFlags,
              model: result.model,
            },
            update: {
              score: result.score,
              location: result.location || null,
              reasonsPro: result.reasonsPro,
              reasonsCon: result.reasonsCon,
              redFlags: result.redFlags,
              model: result.model,
            },
          });
        } catch (err) {
          this.logger.debug(
            `Failed to persist manual vacancy: ${(err as Error).message}`,
          );
        }

        const vacancyView: ScoredVacancyView = {
          id: vacancyId,
          title,
          company: null,
          url: null,
          source: 'manual',
          salaryMin: null,
          salaryMax: null,
          currency: null,
          remote: null,
        };
        const keyboard = new InlineKeyboard()
          .text('👍 Interesting', `fb:interested:${vacancyId}`)
          .text('👎 Pass', `fb:rejected:${vacancyId}`);

        await ctx.reply(formatVacancyCard(result, vacancyView, threshold), {
          reply_markup: keyboard,
          parse_mode: 'HTML',
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await ctx.reply(`❌ Scoring failed: ${msg}`);
      }
    });

    this.bot.on('callback_query:data', async (ctx) => {
      const data = ctx.callbackQuery.data;
      if (!data?.startsWith('fb:')) return;

      const parts = data.split(':');
      const verdict = parts[1];
      const vacancyId = parts.slice(2).join(':');

      await ctx.answerCallbackQuery('Feedback recorded ✅');

      if (vacancyId && vacancyId !== 'manual') {
        const ownerUserId = getOwnerUserId(this.configService);
        try {
          await this.prisma.userMatch.update({
            where: {
              userId_vacancyId: { userId: ownerUserId, vacancyId },
            },
            data: { verdict },
          });
        } catch (err) {
          this.logger.debug(
            `Failed to persist feedback: ${(err as Error).message}`,
          );
        }
      }

      this.logger.log(`Feedback: ${verdict} for vacancy ${vacancyId}`);
    });
  }
}
