/// <reference lib="webworker" />

import * as ort from 'onnxruntime-web/wasm';
import { ImageMagick, MagickFormat, initializeImageMagick, type IMagickImage } from '@imagemagick/magick-wasm';
import magickWasmUrl from '@imagemagick/magick-wasm/magick.wasm?url';

import { prepareU2NetTensor, type BackgroundWorkerRequest, type BackgroundWorkerResponse } from './background-types';
import { detectMagickFormat } from '../image/image-content';
import { rasterizeSvg } from '../image/svg-rasterizer';

const MODEL_SIZE = 320;
const workerScope = self as unknown as DedicatedWorkerGlobalScope;
let sessionPromise: Promise<ort.InferenceSession> | undefined;
let imageMagickInitialization: Promise<void> | undefined;

workerScope.onmessage = async ({ data }: MessageEvent<BackgroundWorkerRequest>) => {
  try {
    post(data.id, 'progress', 0.05);
    const bitmap = await decodeImage(data.bytes);
    try {
      post(data.id, 'progress', 0.18);
      const session = await getSession();
      post(data.id, 'progress', 0.42);
      const scaled = new OffscreenCanvas(MODEL_SIZE, MODEL_SIZE);
      const scaledContext = scaled.getContext('2d', { willReadFrequently: true });
      if (!scaledContext) throw new Error('Canvas is not available in this WebView.');
      scaledContext.drawImage(bitmap, 0, 0, MODEL_SIZE, MODEL_SIZE);
      const pixels = scaledContext.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE).data;
      const input = new ort.Tensor('float32', prepareU2NetTensor(pixels), [1, 3, MODEL_SIZE, MODEL_SIZE]);
      post(data.id, 'progress', 0.52);
      const feeds: Record<string, ort.Tensor> = { [session.inputNames[0]]: input };
      const outputs = await session.run(feeds);
      const mask = outputs[session.outputNames[0]].data as Float32Array;
      post(data.id, 'progress', 0.82);
      const result = await applyMask(bitmap, mask);
      workerScope.postMessage({ id: data.id, type: 'result', result } satisfies BackgroundWorkerResponse, [result.bytes.buffer]);
    } finally {
      bitmap.close();
    }
  } catch (error) {
    workerScope.postMessage({ id: data.id, type: 'error', error: error instanceof Error ? error.message : String(error) } satisfies BackgroundWorkerResponse);
  }
};

async function decodeImage(bytes: ArrayBuffer): Promise<ImageBitmap> {
  const input = new Uint8Array(bytes);
  const detectedFormat = detectMagickFormat(input);
  if (detectedFormat === MagickFormat.Svg) {
    const png = await rasterizeSvg(input);
    return createImageBitmap(new Blob([png as BlobPart], { type: 'image/png' }));
  }
  try {
    return await createImageBitmap(new Blob([bytes]));
  } catch {
    imageMagickInitialization ??= initializeImageMagick(new URL(magickWasmUrl, workerScope.location.href));
    await imageMagickInitialization;
    const formatHint = detectedFormat;
    const encodePng = (image: IMagickImage) =>
      image.write(MagickFormat.Png, (output) => new Uint8Array(output));
    const png = formatHint
      ? ImageMagick.read(input, formatHint, encodePng)
      : ImageMagick.read(input, encodePng);
    return createImageBitmap(new Blob([png as BlobPart], { type: 'image/png' }));
  }
}

async function getSession(): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    const root = import.meta.env.DEV
      ? new URL('../../../', workerScope.location.href)
      : new URL('../', workerScope.location.href);
    ort.env.wasm.wasmPaths = new URL('ai/', root).href;
    ort.env.wasm.numThreads = Math.max(1, Math.min(2, navigator.hardwareConcurrency || 1));
    const model = new URL('ai/u2netp.onnx', root).href;
    sessionPromise = ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  }
  return sessionPromise;
}

async function applyMask(bitmap: ImageBitmap, mask: Float32Array): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const expected = MODEL_SIZE * MODEL_SIZE;
  if (mask.length < expected) throw new Error('The local model returned an invalid mask.');
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < expected; index += 1) {
    minimum = Math.min(minimum, mask[index]);
    maximum = Math.max(maximum, mask[index]);
  }
  const range = maximum - minimum;
  if (!Number.isFinite(range) || range <= 0) throw new Error('The local model returned an empty mask.');

  const maskCanvas = new OffscreenCanvas(MODEL_SIZE, MODEL_SIZE);
  const maskContext = maskCanvas.getContext('2d', { willReadFrequently: true });
  if (!maskContext) throw new Error('Canvas is not available in this WebView.');
  const maskImage = maskContext.createImageData(MODEL_SIZE, MODEL_SIZE);
  for (let index = 0; index < expected; index += 1) {
    const value = Math.round(Math.max(0, Math.min(1, (mask[index] - minimum) / range)) * 255);
    const rgba = index * 4;
    maskImage.data[rgba] = value;
    maskImage.data[rgba + 1] = value;
    maskImage.data[rgba + 2] = value;
    maskImage.data[rgba + 3] = 255;
  }
  maskContext.putImageData(maskImage, 0, 0);

  const output = new OffscreenCanvas(bitmap.width, bitmap.height);
  const outputContext = output.getContext('2d', { willReadFrequently: true });
  if (!outputContext) throw new Error('Canvas is not available in this WebView.');
  outputContext.drawImage(bitmap, 0, 0);
  const original = outputContext.getImageData(0, 0, bitmap.width, bitmap.height);
  const fullMaskCanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const fullMaskContext = fullMaskCanvas.getContext('2d', { willReadFrequently: true });
  if (!fullMaskContext) throw new Error('Canvas is not available in this WebView.');
  fullMaskContext.imageSmoothingEnabled = true;
  fullMaskContext.imageSmoothingQuality = 'high';
  fullMaskContext.drawImage(maskCanvas, 0, 0, bitmap.width, bitmap.height);
  const fullMask = fullMaskContext.getImageData(0, 0, bitmap.width, bitmap.height).data;
  for (let index = 0; index < original.data.length; index += 4) {
    original.data[index + 3] = Math.round(original.data[index + 3] * fullMask[index] / 255);
  }
  outputContext.putImageData(original, 0, 0);
  const blob = await output.convertToBlob({ type: 'image/png' });
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width: bitmap.width, height: bitmap.height };
}

function post(id: number, type: 'progress', progress: number): void {
  workerScope.postMessage({ id, type, progress } satisfies BackgroundWorkerResponse);
}
