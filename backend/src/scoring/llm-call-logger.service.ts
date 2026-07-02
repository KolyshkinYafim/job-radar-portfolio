import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface LlmCallLog {
  userId?: string;
  taskType: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  ok: boolean;
}

@Injectable()
export class LlmCallLogger {
  private readonly logger = new Logger(LlmCallLogger.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(input: LlmCallLog): Promise<void> {
    try {
      await this.prisma.llmCall.create({
        data: {
          userId: input.userId ?? null,
          taskType: input.taskType,
          model: input.model,
          promptTokens: input.promptTokens,
          completionTokens: input.completionTokens,
          latencyMs: input.latencyMs,
          ok: input.ok,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to persist LlmCall (taskType=${input.taskType}, model=${input.model}): ${(err as Error).message}`,
      );
    }
  }
}
