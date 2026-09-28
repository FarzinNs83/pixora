import { readFile } from 'node:fs/promises';

import * as ort from 'onnxruntime-web/wasm';

const [wasm, model] = await Promise.all([
  readFile(new URL('../public/ai/ort-wasm-simd-threaded.wasm', import.meta.url)),
  readFile(new URL('../public/ai/u2netp.onnx', import.meta.url)),
]);

ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmBinary = wasm;

const session = await ort.InferenceSession.create(model, {
  executionProviders: ['wasm'],
  graphOptimizationLevel: 'all',
});
assert(session.inputNames.length > 0, 'U2NetP has no input tensor.');
assert(session.outputNames.length > 0, 'U2NetP has no output tensor.');

const input = new ort.Tensor('float32', new Float32Array(3 * 320 * 320), [1, 3, 320, 320]);
const outputs = await session.run({ [session.inputNames[0]]: input });
const mask = outputs[session.outputNames[0]];

assert(mask.dims.join('x') === '1x1x320x320', `Unexpected mask dimensions: ${mask.dims.join('x')}.`);
assert(mask.data.length === 320 * 320, `Unexpected mask length: ${mask.data.length}.`);
for (let index = 0; index < mask.data.length; index += 4096) {
  assert(Number.isFinite(Number(mask.data[index])), `Mask contains a non-finite value at ${index}.`);
}

console.log(`AI smoke passed: ${session.inputNames[0]} -> ${session.outputNames[0]} (${mask.dims.join('×')}).`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
