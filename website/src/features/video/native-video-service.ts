import { videoOutputMime, type VideoOptions, type VideoResult } from './video-types';

type ProgressHandler = (progress: number) => void;

export class NativeVideoService {
  private availability?: Promise<'native' | 'missing' | 'browser'>;
  private active?: { id: string; controller: AbortController };

  availabilityStatus(): Promise<'native' | 'missing' | 'browser'> {
    this.availability ??= fetch(new URL('api/video/capabilities', window.location.href))
      .then(async (response) => {
        if (!response.ok) return 'browser';
        const capabilities = await response.json() as { desktop?: boolean; available?: boolean };
        return capabilities.desktop === true ? (capabilities.available === true ? 'native' : 'missing') : 'browser';
      })
      .catch(() => 'browser');
    return this.availability;
  }

  async convert(file: File, options: VideoOptions, onProgress: ProgressHandler, watermark?: File): Promise<VideoResult> {
    const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const controller = new AbortController();
    this.active = { id, controller };
    const endpoint = (action: string) => new URL(`api/video/jobs/${id}/${action}`, window.location.href);
    const poll = window.setInterval(() => {
      fetch(endpoint('status'))
        .then((response) => response.ok ? response.json() : null)
        .then((status) => {
          if (this.active?.id === id && typeof status?.progress === 'number') onProgress(status.progress);
        })
        .catch(() => {});
    }, 500);

    let completed = false;
    try {
      onProgress(0);
      if (watermark) {
        const response = await fetch(endpoint('watermark'), {
          method: 'POST', body: watermark, signal: controller.signal,
        });
        if (!response.ok) throw new Error(await responseError(response));
      }
      const extension = file.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
      const response = await fetch(endpoint('convert'), {
        method: 'POST', body: file, signal: controller.signal,
        headers: {
          'X-Pixora-Options': JSON.stringify(options),
          'X-Pixora-Extension': extension,
        },
      });
      if (!response.ok) throw new Error(await responseError(response));
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.byteLength) throw new Error('Native FFmpeg returned an empty video.');
      onProgress(1);
      completed = true;
      return { bytes, mimeType: videoOutputMime(options.outputFormat), outputFormat: options.outputFormat };
    } finally {
      window.clearInterval(poll);
      if (this.active?.id === id) this.active = undefined;
      if (!completed) {
        void fetch(endpoint('cancel'), { method: 'POST', keepalive: true }).catch(() => {});
      }
    }
  }

  cancel(): void {
    const active = this.active;
    if (!active) return;
    this.active = undefined;
    active.controller.abort();
    void fetch(new URL(`api/video/jobs/${active.id}/cancel`, window.location.href), {
      method: 'POST', keepalive: true,
    }).catch(() => {});
  }
}

async function responseError(response: Response): Promise<string> {
  try {
    const body = await response.json() as { error?: string };
    return body.error || `Native video conversion failed (${response.status}).`;
  } catch {
    return `Native video conversion failed (${response.status}).`;
  }
}

export const nativeVideoService = new NativeVideoService();
