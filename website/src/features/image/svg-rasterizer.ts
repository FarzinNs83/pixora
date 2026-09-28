import { initWasm, Resvg } from '@resvg/resvg-wasm';
import resvgWasmUrl from '@resvg/resvg-wasm/index_bg.wasm?url';

let initialization: Promise<void> | undefined;

export async function rasterizeSvg(bytes: Uint8Array): Promise<Uint8Array> {
  initialization ??= initWasm(new URL(resvgWasmUrl, self.location.href));
  await initialization;

  const renderer = new Resvg(bytes, {
    font: { fontBuffers: [] },
    imageRendering: 0,
    shapeRendering: 2,
    textRendering: 2,
  });
  try {
    if (renderer.width < 1 || renderer.height < 1 || renderer.width > 16384 || renderer.height > 16384) {
      throw new Error('SVG dimensions must be between 1 and 16384 pixels.');
    }
    const rendered = renderer.render();
    try {
      return new Uint8Array(rendered.asPng());
    } finally {
      rendered.free();
    }
  } finally {
    renderer.free();
  }
}
