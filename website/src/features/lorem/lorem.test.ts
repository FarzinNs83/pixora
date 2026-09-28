import { describe, expect, it } from 'vitest';

import { generateLorem, getTextStats } from './lorem';

describe('generateLorem', () => {
  it('generates the exact requested word count', () => {
    const result = generateLorem({ language: 'en', unit: 'words', count: 12, format: 'plain', htmlTag: 'p', classicStart: true });
    expect(result.split(/\s+/)).toHaveLength(12);
    expect(result.startsWith('Lorem ipsum dolor sit amet')).toBe(true);
  });

  it('wraps every requested paragraph in the selected HTML tag', () => {
    const result = generateLorem({ language: 'fa', unit: 'paragraphs', count: 3, format: 'html', htmlTag: 'h2', classicStart: false });
    expect(result.split('\n')).toHaveLength(3);
    expect(result.match(/<h2>/g)).toHaveLength(3);
    expect(result.match(/<\/h2>/g)).toHaveLength(3);
  });

  it('clamps unsafe counts', () => {
    const result = generateLorem({ language: 'en', unit: 'words', count: 1000, format: 'plain', htmlTag: 'p', classicStart: false });
    expect(result.split(/\s+/)).toHaveLength(100);
  });
});

describe('getTextStats', () => {
  it('counts unicode words and characters', () => {
    expect(getTextStats('سلام دنیای خوب')).toEqual({ words: 3, characters: 14 });
  });
});
