import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import coreURL from '@ffmpeg/core?url';
import wasmURL from '@ffmpeg/core/wasm?url';

import { buildVideoArgs, videoOutputMime, videoOutputName, type VideoOptions, type VideoResult } from './video-types';
import { nativeVideoService } from './native-video-service';

type ProgressHandler = (progress: number) => void;

class VideoConversionService {
  private ffmpeg?: FFmpeg;
  private loading?: Promise<FFmpeg>;
  private runId = 0;
  private cancelGeneration = 0;

  async convert(file: File, options: VideoOptions, onProgress: ProgressHandler, watermarkFile?: File): Promise<VideoResult> {
    const generation = this.cancelGeneration;
    const nativeStatus = await nativeVideoService.availabilityStatus();
    if (nativeStatus === 'native') {
      if (generation !== this.cancelGeneration) throw new Error('Cancelled');
      return nativeVideoService.convert(file, options, onProgress, watermarkFile);
    }
    if (generation !== this.cancelGeneration) throw new Error('Cancelled');
    if (nativeStatus === 'missing') throw new NativeVideoUnavailableError();
    try {
      return await this.convertOnce(file, options, onProgress, watermarkFile);
    } catch (error) {
      if (!isMemoryFailure(error)) throw error;
      this.resetEngine();
      if (options.outputFormat === 'mp3' || options.outputFormat === 'wav') throw new VideoEngineMemoryError();
      const retryWidth = Math.min(options.maxWidth ?? 720, 720);
      try {
        onProgress(0);
        const result = await this.convertOnce(file, { ...options, maxWidth: retryWidth }, onProgress, watermarkFile);
        return { ...result, limitedToWidth: retryWidth };
      } catch (retryError) {
        if (isMemoryFailure(retryError)) {
          this.resetEngine();
          throw new VideoEngineMemoryError();
        }
        throw retryError;
      }
    }
  }

  private async convertOnce(file: File, options: VideoOptions, onProgress: ProgressHandler, watermarkFile?: File): Promise<VideoResult> {
    const ffmpeg = await this.getFFmpeg();
    const runId = ++this.runId;
    const safeInput = `input-${runId}.${file.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin'}`;
    const safeOutput = `output-${runId}.${options.outputFormat}`;
    const safeWatermark = watermarkFile ? `watermark-${runId}.${watermarkFile.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'png'}` : undefined;
    const progressHandler = ({ progress }: { progress: number }) => {
      if (Number.isFinite(progress)) onProgress(Math.max(0, Math.min(1, progress)));
    };
    const errors: string[] = [];
    const logHandler = ({ type, message }: { type: string; message: string }) => {
      if (type === 'stderr' && /error|invalid|failed|out of memory/i.test(message)) errors.push(message);
      if (errors.length > 5) errors.shift();
    };
    ffmpeg.on('progress', progressHandler);
    ffmpeg.on('log', logHandler);

    try {
      onProgress(0);
      await ffmpeg.writeFile(safeInput, await fetchFile(file));
      if (safeWatermark && watermarkFile) await ffmpeg.writeFile(safeWatermark, await fetchFile(watermarkFile));
      const exitCode = await ffmpeg.exec(buildVideoArgs(safeInput, safeOutput, options, safeWatermark));
      if (exitCode !== 0) throw new Error(errors.at(-1) || `Video conversion failed (code ${exitCode}).`);
      const output = await ffmpeg.readFile(safeOutput);
      if (!(output instanceof Uint8Array) || output.byteLength === 0) throw new Error('FFmpeg did not create an output file.');
      onProgress(1);
      return { bytes: new Uint8Array(output), mimeType: videoOutputMime(options.outputFormat), outputFormat: options.outputFormat };
    } catch (error) {
      if (isMemoryFailure(error)) this.resetEngine();
      throw error;
    } finally {
      ffmpeg.off('progress', progressHandler);
      ffmpeg.off('log', logHandler);
      await Promise.allSettled([ffmpeg.deleteFile(safeInput), ffmpeg.deleteFile(safeOutput), ...(safeWatermark ? [ffmpeg.deleteFile(safeWatermark)] : [])]);
    }
  }

  cancel(): void {
    this.cancelGeneration += 1;
    nativeVideoService.cancel();
    this.resetEngine();
    this.runId += 1;
  }

  private resetEngine(): void {
    this.ffmpeg?.terminate();
    this.ffmpeg = undefined;
    this.loading = undefined;
  }

  private getFFmpeg(): Promise<FFmpeg> {
    if (this.ffmpeg?.loaded) return Promise.resolve(this.ffmpeg);
    if (this.loading) return this.loading;
    const loading = (async () => {
      const ffmpeg = new FFmpeg();
      this.ffmpeg = ffmpeg;
      try {
        await ffmpeg.load({ coreURL, wasmURL });
        return ffmpeg;
      } catch (error) {
        ffmpeg.terminate();
        if (this.ffmpeg === ffmpeg) this.ffmpeg = undefined;
        throw error;
      }
    })();
    this.loading = loading;
    return loading.finally(() => { if (this.loading === loading) this.loading = undefined; });
  }
}

export const videoConversionService = new VideoConversionService();
export { videoOutputName };

export class VideoEngineMemoryError extends Error {
  constructor() {
    super('The local video engine ran out of memory. Try a shorter clip or smaller width.');
    this.name = 'VideoEngineMemoryError';
  }
}

export class NativeVideoUnavailableError extends Error {
  constructor() {
    super('Native FFmpeg is not available. Place ffmpeg beside Pixora or install it on PATH.');
    this.name = 'NativeVideoUnavailableError';
  }
}

export function isMemoryFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /memory access out of bounds|out of memory|cannot read properties of undefined \(reading 'startsWith'\)|Aborted\(/i.test(message);
}
