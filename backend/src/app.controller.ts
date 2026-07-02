import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ScoringService } from './scoring/scoring.service';

@Controller()
export class AppController {
  constructor(
    private configService: ConfigService,
    private scoringService: ScoringService,
  ) {}

  @Get()
  getHello() {
    return { status: 'ok', service: 'job-radar' };
  }

  @Get('health')
  async getHealth() {
    const healthy = await this.scoringService.isHealthy();

    return {
      status: 'ok',
      llm: healthy ? 'healthy' : 'unreachable',
      llmUrl: this.configService.get<string>('llm.baseUrl'),
    };
  }
}
