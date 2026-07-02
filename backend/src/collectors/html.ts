const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
};

const MAX_CODE_POINT = 0x10ffff;
const SURROGATE_RANGE_START = 0xd800;
const SURROGATE_RANGE_END = 0xdfff;

const isValidCodePoint = (code: number): boolean =>
  Number.isInteger(code) &&
  code > 0 &&
  code <= MAX_CODE_POINT &&
  (code < SURROGATE_RANGE_START || code > SURROGATE_RANGE_END);

const decodeCodePoint = (code: number, fallback: string): string => {
  if (!isValidCodePoint(code)) return fallback;
  try {
    return String.fromCodePoint(code);
  } catch {
    return fallback;
  }
};

export function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (match, hex: string) =>
      decodeCodePoint(parseInt(hex, 16), match),
    )
    .replace(/&#(\d+);/g, (match, dec: string) =>
      decodeCodePoint(parseInt(dec, 10), match),
    )
    .replace(
      /&([a-z]+);/gi,
      (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match,
    )
    .replace(/\s+/g, ' ')
    .trim();
}
