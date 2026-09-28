import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { ImageMagick, MagickFormat, initializeImageMagick } from '@imagemagick/magick-wasm';
import { initWasm as initializeResvg, Resvg } from '@resvg/resvg-wasm';

const projectRoot = new URL('../../', import.meta.url);
const wasm = await readFile(new URL('../node_modules/@imagemagick/magick-wasm/dist/x86/magick.wasm', import.meta.url));
await initializeImageMagick(wasm);
const resvgWasm = await readFile(new URL('../node_modules/@resvg/resvg-wasm/index_bg.wasm', import.meta.url));
await initializeResvg(resvgWasm);

const svg = await readFile(new URL('../public/pixora-mark.svg', import.meta.url));
const renderer = new Resvg(svg, { font: { fontBuffers: [] } });
let sourcePng;
try {
  const rendered = renderer.render();
  try {
    sourcePng = new Uint8Array(rendered.asPng());
  } finally {
    rendered.free();
  }
} finally {
  renderer.free();
}

const pngTargets = [
  ['website/public/pixora-mark-32.png', 32],
  ['website/public/pixora-mark-192.png', 192],
  ...[16, 32, 64, 128, 256, 512, 1024].map((size) => [`macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_${size}.png`, size]),
];

for (const [relativePath, size] of pngTargets) {
  const destination = new URL(relativePath, projectRoot);
  await mkdir(new URL('.', destination), { recursive: true });
  const bytes = ImageMagick.read(sourcePng, MagickFormat.Png, (image) => {
    image.resize(size, size);
    return image.write(MagickFormat.Png, (data) => new Uint8Array(data));
  });
  await writeFile(destination, bytes);
}

const windowsIcon = ImageMagick.read(sourcePng, MagickFormat.Png, (image) => {
  image.resize(256, 256);
  return image.write(MagickFormat.Ico, (data) => new Uint8Array(data));
});
await writeFile(new URL('windows/runner/resources/app_icon.ico', projectRoot), windowsIcon);

console.log(`Generated Pixora web, Windows and macOS icons (${windowsIcon.byteLength} byte ICO).`);
