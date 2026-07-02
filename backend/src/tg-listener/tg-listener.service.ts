import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramClient, utils } from 'telegram';
import { NewMessage, NewMessageEvent } from 'telegram/events';
import { StringSession } from 'telegram/sessions';
import { INGESTOR } from '../common/types';
import type { Ingestor } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';

const MIN_JOB_POST_LENGTH = 80;
const CHANNEL_REFRESH_INTERVAL_MS = 60_000;
const LAST_SEEN_THROTTLE_MS = 60_000;
const CONNECTION_RETRIES = 5;

export function shouldIngest(
  text: string | undefined,
  isKnownChat: boolean,
): boolean {
  return (
    isKnownChat &&
    typeof text === 'string' &&
    text.trim().length > MIN_JOB_POST_LENGTH
  );
}

@Injectable()
export class TgListenerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TgListenerService.name);

  private client: TelegramClient | null = null;
  private handlesByChatId = new Map<string, string>();
  private readonly chatIdsByHandle = new Map<string, string>();
  private readonly lastSeenWriteAt = new Map<string, number>();
  private refreshTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(INGESTOR) private readonly ingestor: Ingestor,
  ) {}

  async onModuleInit(): Promise<void> {
    const apiId = this.config.get<number>('telegram.apiId');
    const apiHash = this.config.get<string>('telegram.apiHash');
    const session = this.config.get<string>('telegram.session');

    if (!apiId || !apiHash || !session) {
      this.logger.log('TG listener disabled (no credentials)');
      return;
    }

    try {
      const client = new TelegramClient(
        new StringSession(session),
        apiId,
        apiHash,
        {
          connectionRetries: CONNECTION_RETRIES,
        },
      );
      await client.connect();

      if (!(await client.isUserAuthorized())) {
        this.logger.warn(
          'TG session is not authorized; run `npm run tg:login` and put the printed string into TELEGRAM_SESSION',
        );
        await client.disconnect();
        return;
      }

      this.client = client;
      await this.refreshChannels();
      client.addEventHandler((event: NewMessageEvent) => {
        void this.handleNewMessage(event);
      }, new NewMessage({}));
      this.refreshTimer = setInterval(() => {
        void this.refreshChannels();
      }, CHANNEL_REFRESH_INTERVAL_MS);

      this.logger.log(
        `TG listener started, watching ${this.handlesByChatId.size} channel(s)`,
      );
    } catch (error) {
      this.logger.error(
        `TG listener failed to start: ${(error as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    const client = this.client;
    this.client = null;
    if (client) {
      try {
        await client.disconnect();
      } catch (error) {
        this.logger.warn(
          `TG listener disconnect failed: ${(error as Error).message}`,
        );
      }
    }
  }

  private async refreshChannels(): Promise<void> {
    const client = this.client;
    if (!client) {
      return;
    }

    try {
      const channels = await this.prisma.channel.findMany({
        where: { kind: 'tg', enabled: true },
      });

      const next = new Map<string, string>();
      for (const channel of channels) {
        const chatId = await this.resolveChatId(client, channel.handle);
        if (chatId) {
          next.set(chatId, channel.handle);
        }
      }
      this.handlesByChatId = next;
    } catch (error) {
      this.logger.warn(`Channel refresh failed: ${(error as Error).message}`);
    }
  }

  private async resolveChatId(
    client: TelegramClient,
    handle: string,
  ): Promise<string | null> {
    const cached = this.chatIdsByHandle.get(handle);
    if (cached) {
      return cached;
    }

    try {
      const entity = await client.getEntity(handle);
      const chatId = utils.getPeerId(entity);
      this.chatIdsByHandle.set(handle, chatId);
      return chatId;
    } catch (error) {
      this.logger.warn(
        `Cannot resolve channel ${handle}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  private async handleNewMessage(event: NewMessageEvent): Promise<void> {
    try {
      const chatId = event.chatId?.toString();
      const handle = chatId ? this.handlesByChatId.get(chatId) : undefined;
      const message = event.message;

      if (
        !shouldIngest(message.text, handle !== undefined) ||
        !chatId ||
        !handle
      ) {
        return;
      }

      await this.ingestor.ingest({
        source: `tg:${handle}`,
        externalId: `${chatId}:${message.id}`,
        url: handle.startsWith('@')
          ? `https://t.me/${handle.slice(1)}/${message.id}`
          : undefined,
        rawText: message.text,
        postedAt: new Date(message.date * 1000),
      });

      await this.touchChannel(handle);
    } catch (error) {
      this.logger.error(
        `Failed to process TG message: ${(error as Error).message}`,
      );
    }
  }

  private async touchChannel(handle: string): Promise<void> {
    const now = Date.now();
    const lastWrite = this.lastSeenWriteAt.get(handle) ?? 0;
    if (now - lastWrite < LAST_SEEN_THROTTLE_MS) {
      return;
    }
    this.lastSeenWriteAt.set(handle, now);
    await this.prisma.channel.update({
      where: { handle },
      data: { lastSeen: new Date(now) },
    });
  }
}
