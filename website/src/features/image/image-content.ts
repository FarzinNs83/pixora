import { MagickFormat, type MagickFormat as MagickFormatType } from '@imagemagick/magick-wasm';

export function detectMagickFormat(bytes: Uint8Array): MagickFormatType | undefined {
  if (matches(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return MagickFormat.Png;
  if (matches(bytes, [0xff, 0xd8, 0xff])) return MagickFormat.Jpeg;
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return MagickFormat.WebP;
  if (ascii(bytes, 0, 4) === 'GIF8') return MagickFormat.Gif;
  if (ascii(bytes, 0, 2) === 'BM') return MagickFormat.Bmp;
  if (matches(bytes, [0x49, 0x49, 0x2a, 0x00]) || matches(bytes, [0x4d, 0x4d, 0x00, 0x2a])) return MagickFormat.Tiff;
  if (matches(bytes, [0x00, 0x00, 0x01, 0x00])) return MagickFormat.Ico;
  if (matches(bytes, [0x00, 0x00, 0x02, 0x00])) return MagickFormat.Cur;
  if (ascii(bytes, 4, 8) === 'ftyp') {
    const brands = ascii(bytes, 8, Math.min(bytes.length, 40));
    if (brands.includes('avif') || brands.includes('avis')) return MagickFormat.Avif;
    if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].some((brand) => brands.includes(brand))) return MagickFormat.Heic;
  }
  const textStart = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 512))).replace(/^\uFEFF/, '').trimStart();
  if (/^(?:<\?xml[\s\S]*?)?<svg[\s>]/i.test(textStart)) return MagickFormat.Svg;
  return undefined;
}

function matches(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}
