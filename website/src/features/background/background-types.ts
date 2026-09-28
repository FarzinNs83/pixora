export interface BackgroundRemovalResult {
  bytes: Uint8Array;
  width: number;
  height: number;
}

export type BackgroundWorkerRequest = { id: number; bytes: ArrayBuffer };
export type BackgroundWorkerResponse =
  | { id: number; type: 'progress'; progress: number }
  | { id: number; type: 'result'; result: BackgroundRemovalResult }
  | { id: number; type: 'error'; error: string };

export function backgroundOutputName(inputName: string): string {
  const base = inputName.replace(/\.[^.]+$/, '') || 'image';
  return `${base}-no-background.png`;
}

export function prepareU2NetTensor(pixels: Uint8ClampedArray): Float32Array {
  const pixelCount = pixels.length / 4;
  const tensor = new Float32Array(pixelCount * 3);
  const mean = [0.485, 0.456, 0.406];
  const deviation = [0.229, 0.224, 0.225];
  for (let index = 0; index < pixelCount; index += 1) {
    const rgba = index * 4;
    tensor[index] = (pixels[rgba] / 255 - mean[0]) / deviation[0];
    tensor[pixelCount + index] = (pixels[rgba + 1] / 255 - mean[1]) / deviation[1];
    tensor[pixelCount * 2 + index] = (pixels[rgba + 2] / 255 - mean[2]) / deviation[2];
  }
  return tensor;
}
