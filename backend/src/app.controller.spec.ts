import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { ScoringService } from './scoring/scoring.service';

describe('AppController', () => {
  let appController: AppController;
  const mockScoring = { isHealthy: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockScoring.isHealthy.mockResolvedValue(true);

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: ConfigService,
          useValue: { get: () => 'http://127.0.0.1:1234/v1' },
        },
        { provide: ScoringService, useValue: mockScoring },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return status ok', () => {
      expect(appController.getHello()).toEqual({
        status: 'ok',
        service: 'job-radar',
      });
    });
  });

  describe('health', () => {
    it('reports healthy LLM via the scoring service', async () => {
      await expect(appController.getHealth()).resolves.toEqual({
        status: 'ok',
        llm: 'healthy',
        llmUrl: 'http://127.0.0.1:1234/v1',
      });
    });

    it('reports unreachable LLM', async () => {
      mockScoring.isHealthy.mockResolvedValue(false);
      const health = await appController.getHealth();
      expect(health.llm).toBe('unreachable');
    });
  });
});
