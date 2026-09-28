import { MagickFormat } from '@imagemagick/magick-wasm';
import { describe, expect, it } from 'vitest';

import { detectMagickFormat } from './image-content';

const asciiBytes = (value: string) => [...new TextEncoder().encode(value)];

describe('content-based image detection', () => {
  it.each([
    ['PNG', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], MagickFormat.Png],
    ['JPEG', [0xff, 0xd8, 0xff, 0xe0], MagickFormat.Jpeg],
    ['GIF', asciiBytes('GIF89a'), MagickFormat.Gif],
    ['TIFF', [0x49, 0x49, 0x2a, 0x00], MagickFormat.Tiff],
    ['BMP', asciiBytes('BM'), MagickFormat.Bmp],
    ['ICO', [0x00, 0x00, 0x01, 0x00], MagickFormat.Ico],
  ])('detects %s from magic bytes', (_, signature, expected) => {
    expect(detectMagickFormat(new Uint8Array(signature as number[]))).toBe(expected);
  });

  it('detects WebP, AVIF, HEIC and SVG structures', () => {
    expect(detectMagickFormat(new Uint8Array(asciiBytes('RIFF1234WEBP')))).toBe(MagickFormat.WebP);
    expect(detectMagickFormat(new Uint8Array(asciiBytes('0000ftypavif0000')))).toBe(MagickFormat.Avif);
    expect(detectMagickFormat(new Uint8Array(asciiBytes('0000ftypheic0000')))).toBe(MagickFormat.Heic);
    expect(detectMagickFormat(new TextEncoder().encode('  <?xml version="1.0"?><svg viewBox="0 0 1 1">'))).toBe(MagickFormat.Svg);
  });

  it('leaves unknown formats for ImageMagick probing', () => {
    expect(detectMagickFormat(new Uint8Array([1, 2, 3, 4]))).toBeUndefined();
  });
});
