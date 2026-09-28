export const imageOutputFormats = ['png', 'jpg', 'webp', 'avif', 'gif', 'tiff', 'bmp', 'ico', 'svg'] as const;
export type ImageOutputFormat = (typeof imageOutputFormats)[number];

export interface ImageConversionOptions {
  outputFormat: ImageOutputFormat;
  quality: number;
  width?: number;
  height?: number;
  scalePercent?: number;
  resizeMode: 'contain' | 'cover' | 'stretch';
  stripMetadata: boolean;
  watermark?: {
    bytes: Uint8Array;
    scalePercent: number;
    opacity: number;
    position: 'northwest' | 'northeast' | 'center' | 'southwest' | 'southeast';
  };
}

export interface ImageConversionResult {
  bytes: Uint8Array;
  inputFormat: string;
  outputFormat: ImageOutputFormat;
  width: number;
  height: number;
}

export const maxImageDimension = 16384;
export const maxImageScalePercent = 500;

export function parseImageDimension(value: string): number | undefined | null {
  if (!value.trim()) return undefined;
  const dimension = Number(value);
  if (!Number.isInteger(dimension) || dimension < 1 || dimension > maxImageDimension) return null;
  return dimension;
}

export function parseImageScalePercent(value: string): number | null {
  const percent = Number(value);
  if (!Number.isFinite(percent) || percent < 1 || percent > maxImageScalePercent) return null;
  return Math.round(percent * 100) / 100;
}

export type ImageJobStatus = 'queued' | 'processing' | 'done' | 'error';

export interface ImageJob {
  id: string;
  file: File;
  status: ImageJobStatus;
  detectedFormat?: string;
  output?: ImageConversionResult;
  error?: string;
}

export function outputMime(format: ImageOutputFormat): string {
  return format === 'svg' ? 'image/svg+xml' : format === 'jpg' ? 'image/jpeg' : `image/${format}`;
}

export function outputExtension(format: ImageOutputFormat): string {
  return format === 'jpg' ? 'jpg' : format;
}

export function outputFileName(inputName: string, format: ImageOutputFormat): string {
  const dot = inputName.lastIndexOf('.');
  const stem = dot > 0 ? inputName.slice(0, dot) : inputName;
  return `${stem}.${outputExtension(format)}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function savingPercent(before: number, after: number): number {
  if (before <= 0) return 0;
  return Math.round((1 - after / before) * 100);
}
