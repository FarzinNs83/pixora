import type { BackgroundRemovalResult, BackgroundWorkerRequest, BackgroundWorkerResponse } from './background-types';

type PendingJob = {
  resolve: (value: BackgroundRemovalResult) => void;
  reject: (reason: Error) => void;
  onProgress: (progress: number) => void;
};

class BackgroundRemovalService {
  private worker?: Worker;
  private nextId = 0;
  private generation = 0;
  private readonly pending = new Map<number, PendingJob>();

  async remove(file: File, onProgress: (progress: number) => void): Promise<BackgroundRemovalResult> {
    const worker = this.getWorker();
    const id = ++this.nextId;
    const generation = this.generation;
    const bytes = await file.arrayBuffer();
    if (generation !== this.generation) throw new Error('Cancelled');
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress });
      try {
        worker.postMessage({ id, bytes } satisfies BackgroundWorkerRequest, [bytes]);
      } catch (error) {
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  cancel(): void {
    this.generation += 1;
    this.worker?.terminate();
    this.worker = undefined;
    for (const job of this.pending.values()) job.reject(new Error('Cancelled'));
    this.pending.clear();
  }

  private getWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('./background.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }: MessageEvent<BackgroundWorkerResponse>) => {
      const job = this.pending.get(data.id);
      if (!job) return;
      if (data.type === 'progress') { job.onProgress(data.progress); return; }
      this.pending.delete(data.id);
      if (data.type === 'result') job.resolve(data.result);
      else job.reject(new Error(data.error));
    };
    worker.onerror = (event) => {
      const error = new Error(event.message || 'Background removal worker failed.');
      for (const job of this.pending.values()) job.reject(error);
      this.pending.clear();
      worker.terminate();
      this.worker = undefined;
    };
    this.worker = worker;
    return worker;
  }
}

export const backgroundRemovalService = new BackgroundRemovalService();
