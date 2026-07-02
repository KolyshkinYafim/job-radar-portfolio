import { stripHtml } from './html';

describe('stripHtml', () => {
  it('strips tags and collapses whitespace', () => {
    expect(stripHtml('<p>Hello   <b>world</b></p>\n\n')).toBe('Hello world');
  });

  it('decodes named entities', () => {
    expect(stripHtml('Tom &amp; Jerry &mdash; a &ldquo;story&rdquo;')).toBe(
      'Tom & Jerry — a “story”',
    );
  });

  it('decodes decimal and hex numeric entities', () => {
    expect(stripHtml('&#8211; en dash, &#x2013; hex en dash')).toBe(
      '– en dash, – hex en dash',
    );
  });

  it('leaves unknown named entities untouched', () => {
    expect(stripHtml('&unknownentity;')).toBe('&unknownentity;');
  });

  it('does not throw on a lone-surrogate numeric entity and leaves it untouched', () => {
    expect(() => stripHtml('broken &#xD800; entity')).not.toThrow();
    expect(stripHtml('broken &#xD800; entity')).toBe('broken &#xD800; entity');
    expect(stripHtml('broken &#55296; entity')).toBe('broken &#55296; entity');
  });

  it('rejects out-of-range code points', () => {
    expect(stripHtml('&#x110000;')).toBe('&#x110000;');
    expect(stripHtml('&#0;')).toBe('&#0;');
  });
});
