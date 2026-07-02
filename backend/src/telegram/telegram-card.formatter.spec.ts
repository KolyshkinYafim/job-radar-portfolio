import type { ScoredVacancyView, ScoreResult } from '../common/types';
import { escapeHtml, formatVacancyCard } from './telegram-card.formatter';

const baseVacancy: ScoredVacancyView = {
  id: 'v1',
  title: 'Senior Engineer',
  company: 'Acme',
  url: 'https://acme.test/jobs/1',
  source: 'greenhouse/acme',
  salaryMin: 8000,
  salaryMax: 12000,
  currency: 'EUR',
  remote: 'remote-eu',
};

const baseScore: ScoreResult = {
  score: 82,
  location: 'Berlin, Germany',
  reasonsPro: ['Core stack matches'],
  reasonsCon: ['No salary band'],
  stackMatch: [],
  redFlags: ['Onsite only'],
  model: 'test-model',
  latencyMs: 0,
};

describe('formatVacancyCard', () => {
  it('renders score, linked title, company, location, salary, source and reasons', () => {
    const card = formatVacancyCard(baseScore, baseVacancy, 65);

    expect(card).toContain('🎯 <b>82/100</b>');
    expect(card).toContain(
      '<a href="https://acme.test/jobs/1">Senior Engineer</a>',
    );
    expect(card).toContain('🏢 Acme');
    expect(card).toContain('📍 Berlin, Germany');
    expect(card).toContain('💰 8,000–12,000 EUR');
    expect(card).toContain('🔗 greenhouse/acme');
    expect(card).toContain('✅ Core stack matches');
    expect(card).toContain('⚠️ No salary band');
    expect(card).toContain('🚫 Onsite only');
  });

  it('picks the emoji relative to the supplied threshold', () => {
    expect(
      formatVacancyCard({ ...baseScore, score: 70 }, baseVacancy, 65),
    ).toContain('✅ <b>70/100</b>');
    expect(
      formatVacancyCard({ ...baseScore, score: 50 }, baseVacancy, 65),
    ).toContain('⚠️ <b>50/100</b>');
  });

  it('falls back to a bold title and a remote label when url/location are absent', () => {
    const card = formatVacancyCard(
      { ...baseScore, location: '' },
      { ...baseVacancy, url: null, remote: 'hybrid' },
      65,
    );

    expect(card).toContain('<b>Senior Engineer</b>');
    expect(card).not.toContain('<a href');
    expect(card).toContain('📍 🏠 Hybrid');
  });

  it('escapes HTML in untrusted fields', () => {
    const card = formatVacancyCard(
      baseScore,
      { ...baseVacancy, company: 'A & <B>' },
      65,
    );

    expect(card).toContain('🏢 A &amp; &lt;B&gt;');
  });
});

describe('escapeHtml', () => {
  it('escapes &, < and >', () => {
    expect(escapeHtml('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d');
  });
});
