import { describe, expect, it } from 'vitest';

import { buildVideoArgs, parseTrimRange, parseVideoWidth, videoOutputMime, videoOutputName } from './video-types';

describe('video conversion arguments', () => {
  it('creates an optimized MP4 command with resize, audio and metadata removal', () => {
    const args = buildVideoArgs('clip.input.mkv', 'clip.mp4', { outputFormat: 'mp4', quality: 80, maxWidth: 1280, keepAudio: true, stripMetadata: true });
    expect(args).toContain('libx264');
    expect(args).toContain('aac');
    expect(args).toContain('-map_metadata');
    expect(args.join(' ')).toContain("min(1280,iw)");
    expect(args.at(-1)).toBe('clip.mp4');
  });

  it('extracts MP3 without a video stream', () => {
    const args = buildVideoArgs('movie.mov', 'movie.mp3', { outputFormat: 'mp3', quality: 70, keepAudio: false, stripMetadata: false });
    expect(args).toContain('-vn');
    expect(args).toContain('libmp3lame');
  });

  it('adds an image watermark and a bounded trim', () => {
    const args = buildVideoArgs('movie.mov', 'movie.mp4', { outputFormat: 'mp4', quality: 75, keepAudio: true, stripMetadata: false, trimStart: 2, trimEnd: 8, watermark: { scalePercent: 20, opacity: 70, position: 'southeast' } }, 'logo.png');
    expect(args.slice(0, 8)).toEqual(['-threads', '1', '-filter_threads', '1', '-ss', '2', '-i', 'movie.mov']);
    expect(args).toContain('-filter_complex');
    expect(args.join(' ')).toContain('overlay=W-w-20:H-h-20');
    expect(args).toContain('6');
  });

  it('creates stable names and MIME types', () => {
    expect(videoOutputName('holiday.final.MOV', 'webm')).toBe('holiday.final.webm');
    expect(videoOutputMime('gif')).toBe('image/gif');
  });

  it('rejects unsafe widths and invalid trim ranges', () => {
    expect(parseVideoWidth('')).toBeUndefined();
    expect(parseVideoWidth('1920')).toBe(1920);
    expect(parseVideoWidth('1919')).toBeNull();
    expect(parseVideoWidth('999999')).toBeNull();
    expect(parseTrimRange('2', '8')).toEqual({ start: 2, end: 8 });
    expect(parseTrimRange('-1', '')).toBeNull();
    expect(parseTrimRange('8', '2')).toBeNull();
  });
});
