import type { ImageConversionOptions, ImageConversionResult } from './image-types';

interface WorkerSuccess {
  id: number;
  ok: true;
  bytes: ArrayBuffer;
  inputFormat: string;
  outputFormat: ImageConversionResult['outputFormat'];
  width: number;
  height: number;
}

interface WorkerFailure { id: number; ok: false; error: string }
type WorkerResponse = WorkerSuccess | WorkerFailure;

class ImageConversionService {
  private worker?: Worker;
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: ImageConversionResult) => void; reject: (error: Error) => void }>();

  async convert(file: File, options: ImageConversionOptions): Promise<ImageConversionResult> {
    const worker = this.ensureWorker();
    const id = this.nextId++;
    const bytes = await file.arrayBuffer();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ id, bytes, options }, [bytes]);
    });
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('./image.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      const callbacks = this.pending.get(response.id);
      if (!callbacks) return;
      this.pending.delete(response.id);
      if (!response.ok) {
        callbacks.reject(new Error(response.error));
        return;
      }
      callbacks.resolve({
        bytes: new Uint8Array(response.bytes),
        inputFormat: response.inputFormat,
        outputFormat: response.outputFormat,
        width: response.width,
        height: response.height,
      });
    };
    worker.onerror = (event) => {
      const error = new Error(event.message || 'Image worker failed.');
      for (const callbacks of this.pending.values()) callbacks.reject(error);
      this.pending.clear();
      worker.terminate();
      this.worker = undefined;
    };
    this.worker = worker;
    return worker;
  }
}

export const imageConversionService = new ImageConversionService();
