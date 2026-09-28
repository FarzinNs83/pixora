export type LoremLanguage = 'fa' | 'en';
export type LoremUnit = 'words' | 'sentences' | 'paragraphs';
export type LoremFormat = 'plain' | 'html' | 'markdown';
export type HtmlTag = 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

export interface LoremOptions {
  language: LoremLanguage;
  unit: LoremUnit;
  count: number;
  format: LoremFormat;
  htmlTag: HtmlTag;
  classicStart: boolean;
}

const englishWords = [
  'design', 'system', 'interface', 'content', 'layout', 'project', 'creative',
  'digital', 'product', 'simple', 'useful', 'clear', 'visual', 'type', 'space',
  'color', 'motion', 'structure', 'idea', 'studio', 'detail', 'modern', 'flow',
  'page', 'sample', 'text', 'screen', 'element', 'result', 'context',
];

const persianWords = [
  'طراحی', 'سامانه', 'رابط', 'محتوا', 'چیدمان', 'پروژه', 'خلاق', 'دیجیتال',
  'محصول', 'ساده', 'کاربردی', 'روشن', 'دیداری', 'نوشته', 'فضا', 'رنگ',
  'حرکت', 'ساختار', 'ایده', 'استودیو', 'جزئیات', 'مدرن', 'جریان', 'صفحه',
  'نمونه', 'متن', 'نمایش', 'عنصر', 'نتیجه', 'زمینه',
];

const starts = {
  en: ['Lorem', 'ipsum', 'dolor', 'sit', 'amet'],
  fa: ['لورم', 'ایپسوم', 'متن', 'ساختگی', 'برای', 'نمایش', 'طراحی'],
};

function randomIndex(max: number): number {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const value = new Uint32Array(1);
    crypto.getRandomValues(value);
    return value[0] % max;
  }
  return Math.floor(Math.random() * max);
}

function sample(words: string[], count: number): string[] {
  return Array.from({ length: count }, () => words[randomIndex(words.length)]);
}

function sentence(language: LoremLanguage, first = false): string {
  const dictionary = language === 'fa' ? persianWords : englishWords;
  const length = 8 + randomIndex(8);
  const words = first ? [...starts[language], ...sample(dictionary, Math.max(0, length - starts[language].length))] : sample(dictionary, length);
  const joined = words.join(' ');
  const capitalized = language === 'en' ? joined.charAt(0).toUpperCase() + joined.slice(1) : joined;
  return `${capitalized}${language === 'fa' ? '.' : '.'}`;
}

function paragraph(language: LoremLanguage, first = false): string {
  const count = 3 + randomIndex(3);
  return Array.from({ length: count }, (_, index) => sentence(language, first && index === 0)).join(' ');
}

function clampCount(count: number): number {
  if (!Number.isFinite(count)) return 1;
  return Math.min(100, Math.max(1, Math.round(count)));
}

export function generateLorem(options: LoremOptions): string {
  const count = clampCount(options.count);
  const dictionary = options.language === 'fa' ? persianWords : englishWords;
  let blocks: string[];

  if (options.unit === 'words') {
    const prefix = options.classicStart ? starts[options.language].slice(0, count) : [];
    blocks = [[...prefix, ...sample(dictionary, count - prefix.length)].join(' ')];
  } else if (options.unit === 'sentences') {
    blocks = Array.from({ length: count }, (_, index) => sentence(options.language, options.classicStart && index === 0));
  } else {
    blocks = Array.from({ length: count }, (_, index) => paragraph(options.language, options.classicStart && index === 0));
  }

  if (options.format === 'html') {
    return blocks.map((block) => `<${options.htmlTag}>${block}</${options.htmlTag}>`).join('\n');
  }
  if (options.format === 'markdown') {
    return options.htmlTag === 'p'
      ? blocks.join('\n\n')
      : blocks.map((block) => `${'#'.repeat(Number(options.htmlTag.slice(1)))} ${block}`).join('\n\n');
  }
  return options.unit === 'paragraphs' ? blocks.join('\n\n') : blocks.join(' ');
}

export function getTextStats(text: string): { words: number; characters: number } {
  const trimmed = text.trim();
  return {
    words: trimmed ? trimmed.split(/\s+/u).length : 0,
    characters: text.length,
  };
}
