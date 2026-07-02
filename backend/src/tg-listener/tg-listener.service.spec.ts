import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Ingestor } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { shouldIngest, TgListenerService } from './tg-listener.service';

describe('shouldIngest', () => {
  const longText = 'x'.repeat(81);

  it('accepts a long message from a known chat', () => {
    expect(shouldIngest(longText, true)).toBe(true);
  });

  it('rejects messages from unknown chats', () => {
    expect(shouldIngest(longText, false)).toBe(false);
  });

  it('rejects missing text', () => {
    expect(shouldIngest(undefined, true)).toBe(false);
  });

  it('rejects empty text', () => {
    expect(shouldIngest('', true)).toBe(false);
  });

  it('rejects short chatter at or below the length threshold', () => {
    expect(shouldIngest('x'.repeat(80), true)).toBe(false);
  });

  it('ignores surrounding whitespace when measuring length', () => {
    expect(shouldIngest(`  ${'x'.repeat(40)}  `, true)).toBe(false);
  });
});

describe('TgListenerService', () => {
  const createService = (config: Record<string, unknown>) => {
    const configService = {
      get: (key: string) => config[key],
    } as unknown as ConfigService;
    const prisma = {
      channel: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue(undefined),
      },
    } as unknown as PrismaService;
    const ingestor: Ingestor = {
      ingest: jest.fn().mockResolvedValue({ outcome: 'queued' }),
    };
    return {
      service: new TgListenerService(configService, prisma, ingestor),
      prisma,
      ingestor,
    };
  };

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('boots as a no-op when credentials are missing', async () => {
    const { service, prisma } = createService({
      'telegram.apiId': 0,
      'telegram.apiHash': '',
      'telegram.session': '',
    });

    await expect(service.onModuleInit()).resolves.toBeUndefined();

    expect(Logger.prototype.log).toHaveBeenCalledWith(
      'TG listener disabled (no credentials)',
    );
    expect(prisma.channel.findMany).not.toHaveBeenCalled();
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
  });

  it('stays disabled when only some credentials are present', async () => {
    const { service, prisma } = createService({
      'telegram.apiId': 12345,
      'telegram.apiHash': 'hash',
      'telegram.session': '',
    });

    await expect(service.onModuleInit()).resolves.toBeUndefined();

    expect(Logger.prototype.log).toHaveBeenCalledWith(
      'TG listener disabled (no credentials)',
    );
    expect(prisma.channel.findMany).not.toHaveBeenCalled();
  });
});
