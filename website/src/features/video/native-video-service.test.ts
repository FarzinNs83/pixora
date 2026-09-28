import { afterEach, describe, expect, it, vi } from 'vitest';

import { NativeVideoService } from './native-video-service';

afterEach(() => vi.unstubAllGlobals());

describe('native desktop video client', () => {
  it('distinguishes a desktop without FFmpeg from a regular website', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ desktop: true, available: false }) })));
    expect(await new NativeVideoService().availabilityStatus()).toBe('missing');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })));
    expect(await new NativeVideoService().availabilityStatus()).toBe('browser');
  });

  it('streams to the token-scoped local endpoint and returns the converted video', async () => {
    const requests: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requests.push(url);
      if (url.endsWith('/capabilities')) return { ok: true, json: async () => ({ desktop: true, available: true }) };
      if (url.endsWith('/convert')) return { ok: true, arrayBuffer: async () => new Uint8Array([0, 0, 0, 12, 102, 116, 121, 112]).buffer };
      return { ok: true, json: async () => ({ progress: 0.5 }) };
    }));
    const service = new NativeVideoService();
    expect(await service.availabilityStatus()).toBe('native');
    const file = new File([new Uint8Array([1, 2, 3])], 'clip.mp4', { type: 'video/mp4' });
    const progress: number[] = [];
    const result = await service.convert(file, {
      outputFormat: 'mp4', quality: 70, keepAudio: false, stripMetadata: true,
    }, (value) => progress.push(value));
    expect(requests.some((url) => url.includes('/api/video/jobs/') && url.endsWith('/convert'))).toBe(true);
    expect(result.bytes.byteLength).toBe(8);
    expect(progress.at(-1)).toBe(1);
  });
});
