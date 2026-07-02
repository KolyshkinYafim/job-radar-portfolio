import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LlmCallLogger } from './llm-call-logger.service';

function makePrisma(): {
  llmCall: { create: jest.Mock };
} {
  return { llmCall: { create: jest.fn().mockResolvedValue(undefined) } };
}

describe('LlmCallLogger', () => {
  it('writes an LlmCall row with all supplied fields and userId mapped to null when undefined', async () => {
    const prisma = makePrisma();
    const logger = new LlmCallLogger(prisma as unknown as PrismaService);

    await logger.log({
      userId: undefined,
      taskType: 'cv-parse',
      model: 'qwen3-32b',
      promptTokens: 1024,
      completionTokens: 96,
      latencyMs: 4321,
      ok: true,
    });

    expect(prisma.llmCall.create).toHaveBeenCalledTimes(1);
    expect(prisma.llmCall.create).toHaveBeenCalledWith({
      data: {
        userId: null,
        taskType: 'cv-parse',
        model: 'qwen3-32b',
        promptTokens: 1024,
        completionTokens: 96,
        latencyMs: 4321,
        ok: true,
      },
    });
  });

  it('passes userId through when present', async () => {
    const prisma = makePrisma();
    const logger = new LlmCallLogger(prisma as unknown as PrismaService);

    await logger.log({
      userId: 'u-42',
      taskType: 'score',
      model: 'qwen3-32b',
      promptTokens: 10,
      completionTokens: 5,
      latencyMs: 100,
      ok: false,
    });

    expect(prisma.llmCall.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'u-42', ok: false }),
    });
  });

  it('swallows Prisma errors so logging never breaks the caller', async () => {
    const prisma = makePrisma();
    prisma.llmCall.create.mockRejectedValue(new Error('db down'));
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const logger = new LlmCallLogger(prisma as unknown as PrismaService);

    await expect(
      logger.log({
        userId: 'u-1',
        taskType: 'score',
        model: 'qwen3-32b',
        promptTokens: 1,
        completionTokens: 1,
        latencyMs: 10,
        ok: true,
      }),
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/Failed to persist LlmCall/);
    warnSpy.mockRestore();
  });
});
