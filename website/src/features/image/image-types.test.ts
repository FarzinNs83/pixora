import { describe, expect, it } from 'vitest';

import { formatFileSize, outputFileName, parseImageDimension, parseImageScalePercent, savingPercent } from './image-types';

describe('image output helpers', () => {
  it('replaces only the last filename extension', () => {
    expect(outputFileName('photo.final.PNG', 'webp')).toBe('photo.final.webp');
    expect(outputFileName('untitled', 'jpg')).toBe('untitled.jpg');
  });

  it('formats output sizes for user feedback', () => {
    expect(formatFileSize(900)).toBe('900 B');
    expect(formatFileSize(2048)).toBe('2.0 KB');
    expect(formatFileSize(2 * 1024 * 1024)).toBe('2.0 MB');
  });

  it('reports both savings and growth', () => {
    expect(savingPercent(1000, 250)).toBe(75);
    expect(savingPercent(1000, 1200)).toBe(-20);
  });

  it('validates dimensions before allocating WASM memory', () => {
    expect(parseImageDimension('')).toBeUndefined();
    expect(parseImageDimension('2048')).toBe(2048);
    expect(parseImageDimension('2.5')).toBeNull();
    expect(parseImageDimension('999999')).toBeNull();
  });

  it('validates percentage resize values', () => {
    expect(parseImageScalePercent('100')).toBe(100);
    expect(parseImageScalePercent('72.5')).toBe(72.5);
    expect(parseImageScalePercent('0')).toBeNull();
    expect(parseImageScalePercent('501')).toBeNull();
  });
});
