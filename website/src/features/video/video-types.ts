export const videoOutputFormats = ['mp4', 'webm', 'mov', 'mkv', 'gif', 'mp3', 'wav'] as const;

export type VideoOutputFormat = (typeof videoOutputFormats)[number];
export type VideoJobStatus = 'queued' | 'loading' | 'processing' | 'done' | 'error' | 'cancelled';

export interface VideoOptions {
  outputFormat: VideoOutputFormat;
  quality: number;
  maxWidth?: number;
  keepAudio: boolean;
  stripMetadata: boolean;
  trimStart?: number;
  trimEnd?: number;
  watermark?: {
    scalePercent: number;
    opacity: number;
    position: 'northwest' | 'northeast' | 'center' | 'southwest' | 'southeast';
  };
}

export interface VideoResult {
  bytes: Uint8Array;
  mimeType: string;
  outputFormat: VideoOutputFormat;
  limitedToWidth?: number;
}

export const maxVideoWidth = 7680;

export function parseVideoWidth(value: string): number | undefined | null {
  if (!value.trim()) return undefined;
  const width = Number(value);
  if (!Number.isInteger(width) || width < 2 || width > maxVideoWidth || width % 2 !== 0) return null;
  return width;
}

export function parseTrimRange(startValue: string, endValue: string): { start?: number; end?: number } | null {
  const start = startValue.trim() ? Number(startValue) : undefined;
  const end = endValue.trim() ? Number(endValue) : undefined;
  if ((start !== undefined && (!Number.isFinite(start) || start < 0)) ||
      (end !== undefined && (!Number.isFinite(end) || end <= (start ?? 0)))) return null;
  return { start, end };
}

export interface VideoJob {
  id: string;
  file: File;
  status: VideoJobStatus;
  progress: number;
  output?: VideoResult;
  error?: string;
}

const formatConfig: Record<VideoOutputFormat, { mime: string; extension: string }> = {
  mp4: { mime: 'video/mp4', extension: 'mp4' },
  webm: { mime: 'video/webm', extension: 'webm' },
  mov: { mime: 'video/quicktime', extension: 'mov' },
  mkv: { mime: 'video/x-matroska', extension: 'mkv' },
  gif: { mime: 'image/gif', extension: 'gif' },
  mp3: { mime: 'audio/mpeg', extension: 'mp3' },
  wav: { mime: 'audio/wav', extension: 'wav' },
};

export function videoOutputName(inputName: string, format: VideoOutputFormat): string {
  const base = inputName.replace(/\.[^.]+$/, '') || 'output';
  return `${base}.${formatConfig[format].extension}`;
}

export function videoOutputMime(format: VideoOutputFormat): string {
  return formatConfig[format].mime;
}

export function buildVideoArgs(input: string, output: string, options: VideoOptions, watermarkInput?: string): string[] {
  const args: string[] = ['-threads', '1', '-filter_threads', '1'];
  if (options.trimStart && options.trimStart > 0) args.push('-ss', String(options.trimStart));
  args.push('-i', input);
  if (watermarkInput && options.watermark) args.push('-loop', '1', '-i', watermarkInput);
  if (options.trimEnd && options.trimEnd > (options.trimStart ?? 0)) args.push('-t', String(options.trimEnd - (options.trimStart ?? 0)));
  if (options.stripMetadata) args.push('-map_metadata', '-1');

  const widthFilter = options.maxWidth
    ? `scale='min(${Math.round(options.maxWidth)},iw)':-2`
    : undefined;

  if (options.outputFormat === 'gif') {
    const scale = options.maxWidth ? `scale='min(${Math.round(options.maxWidth)},iw)':-2:flags=lanczos` : 'scale=iw:-2:flags=lanczos';
    addVideoFilter(args, `fps=12,${scale}`, { ...options, keepAudio: false }, watermarkInput);
    args.push('-loop', '0');
  } else if (options.outputFormat === 'mp3') {
    args.push('-vn', '-c:a', 'libmp3lame', '-q:a', audioQuality(options.quality));
  } else if (options.outputFormat === 'wav') {
    args.push('-vn', '-c:a', 'pcm_s16le');
  } else if (options.outputFormat === 'webm') {
    args.push('-c:v', 'libvpx-vp9', '-crf', videoCrf(options.quality, 18, 48), '-b:v', '0');
    args.push(...(options.keepAudio ? ['-c:a', 'libopus', '-b:a', '128k'] : ['-an']));
    addVideoFilter(args, widthFilter, options, watermarkInput);
  } else {
    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-threads', '1', '-crf', videoCrf(options.quality, 17, 36), '-pix_fmt', 'yuv420p');
    args.push(...(options.keepAudio ? ['-c:a', 'aac', '-b:a', '128k'] : ['-an']));
    addVideoFilter(args, widthFilter, options, watermarkInput);
    if (options.outputFormat === 'mp4' || options.outputFormat === 'mov') args.push('-movflags', '+faststart');
  }

  args.push(output);
  return args;
}

function addVideoFilter(args: string[], resizeFilter: string | undefined, options: VideoOptions, watermarkInput?: string): void {
  if (!watermarkInput || !options.watermark) {
    if (resizeFilter) args.push('-vf', resizeFilter);
    return;
  }
  const base = resizeFilter ?? 'null';
  const scale = Math.min(60, Math.max(5, options.watermark.scalePercent)) / 100;
  const opacity = Math.min(100, Math.max(5, options.watermark.opacity)) / 100;
  const overlay = {
    northwest: '20:20', northeast: 'W-w-20:20', center: '(W-w)/2:(H-h)/2',
    southwest: '20:H-h-20', southeast: 'W-w-20:H-h-20',
  }[options.watermark.position];
  const graph = `[0:v]${base}[base];[1:v]format=rgba,colorchannelmixer=aa=${opacity}[alpha];[alpha][base]scale2ref=w=main_w*${scale}:h=ow/mdar[wm][video];[video][wm]overlay=${overlay}:shortest=1[vout]`;
  args.push('-filter_complex', graph, '-map', '[vout]');
  if (options.keepAudio) args.push('-map', '0:a?');
  args.push('-shortest');
}

function videoCrf(quality: number, best: number, worst: number): string {
  const bounded = Math.min(100, Math.max(1, quality));
  return String(Math.round(worst - ((bounded - 1) / 99) * (worst - best)));
}

function audioQuality(quality: number): string {
  const bounded = Math.min(100, Math.max(1, quality));
  return String(Math.round(9 - ((bounded - 1) / 99) * 7));
}
