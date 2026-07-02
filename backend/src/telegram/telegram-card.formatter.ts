import type { ScoredVacancyView, ScoreResult } from '../common/types';

const REASON_MAX_LENGTH = 140;

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function trimReason(text: string): string {
  const clean = text.trim();
  return clean.length > REASON_MAX_LENGTH
    ? `${clean.slice(0, REASON_MAX_LENGTH - 1).trimEnd()}…`
    : clean;
}

function remoteLabel(remote: string | null): string {
  switch (remote) {
    case 'remote-eu':
      return '🌍 Remote EU';
    case 'remote-global':
      return '🌍 Remote';
    case 'hybrid':
      return '🏠 Hybrid';
    case 'onsite':
      return '🏢 Onsite';
    default:
      return '';
  }
}

function formatSalary(vacancy: ScoredVacancyView): string {
  const currency = vacancy.currency ?? 'EUR';
  if (vacancy.salaryMin && vacancy.salaryMax) {
    return `${vacancy.salaryMin.toLocaleString()}–${vacancy.salaryMax.toLocaleString()} ${currency}`;
  }
  if (vacancy.salaryMin) {
    return `from ${vacancy.salaryMin.toLocaleString()} ${currency}`;
  }
  if (vacancy.salaryMax) {
    return `up to ${vacancy.salaryMax.toLocaleString()} ${currency}`;
  }
  return '';
}

export function formatVacancyCard(
  result: ScoreResult,
  vacancy: ScoredVacancyView,
  threshold: number,
): string {
  const emoji =
    result.score >= 80 ? '🎯' : result.score >= threshold ? '✅' : '⚠️';

  const titleText = escapeHtml(vacancy.title);
  const title = vacancy.url
    ? `<a href="${escapeHtml(vacancy.url)}">${titleText}</a>`
    : `<b>${titleText}</b>`;

  const lines: string[] = [`${emoji} <b>${result.score}/100</b> · ${title}`];

  if (vacancy.company) {
    lines.push(`🏢 ${escapeHtml(vacancy.company)}`);
  }

  const locationText =
    result.location?.trim() || remoteLabel(vacancy.remote) || '';
  if (locationText) {
    lines.push(`📍 ${escapeHtml(locationText)}`);
  }

  const salary = formatSalary(vacancy);
  if (salary) {
    lines.push(`💰 ${salary}`);
  }

  lines.push(`🔗 ${escapeHtml(vacancy.source)}`);
  lines.push('');

  for (const pro of result.reasonsPro.slice(0, 3)) {
    lines.push(`✅ ${escapeHtml(trimReason(pro))}`);
  }
  for (const con of result.reasonsCon.slice(0, 2)) {
    lines.push(`⚠️ ${escapeHtml(trimReason(con))}`);
  }
  for (const flag of result.redFlags.slice(0, 2)) {
    lines.push(`🚫 ${escapeHtml(trimReason(flag))}`);
  }

  return lines.join('\n');
}
