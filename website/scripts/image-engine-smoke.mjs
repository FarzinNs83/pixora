import { readFile } from 'node:fs/promises';

import { AlphaAction, ImageMagick, Magick, MagickColors, MagickFormat, initializeImageMagick } from '@imagemagick/magick-wasm';
import { initWasm as initializeResvg, Resvg } from '@resvg/resvg-wasm';
import ImageTracer from 'imagetracerjs';

const wasm = await readFile(new URL('../node_modules/@imagemagick/magick-wasm/dist/x86/magick.wasm', import.meta.url));
await initializeImageMagick(wasm);
const resvgWasm = await readFile(new URL('../node_modules/@resvg/resvg-wasm/index_bg.wasm', import.meta.url));
await initializeResvg(resvgWasm);

const png = new Uint8Array(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
));

const traceSource = ImageMagick.read(png, (image) => {
  const width = image.width;
  const height = image.height;
  const pixels = image.getPixels((collection) =>
    collection.toByteArray(0, 0, width, height, 'RGBA'),
  );
  return { width, height, pixels };
});

assert(traceSource.width === 1 && traceSource.height === 1, 'ImageMagick did not preserve the fixture dimensions.');
assert(traceSource.pixels, 'ImageMagick did not return RGBA pixels for tracing.');

const outputFormats = [
  ['PNG', MagickFormat.Png, (bytes) => bytes[0] === 0x89 && ascii(bytes, 1, 4) === 'PNG'],
  ['JPEG', MagickFormat.Jpeg, (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8],
  ['WebP', MagickFormat.WebP, (bytes) => ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP'],
  ['AVIF', MagickFormat.Avif, (bytes) => ascii(bytes, 4, 8) === 'ftyp'],
  ['GIF', MagickFormat.Gif, (bytes) => ascii(bytes, 0, 4) === 'GIF8'],
  ['TIFF', MagickFormat.Tiff, (bytes) => ['II', 'MM'].includes(ascii(bytes, 0, 2))],
  ['BMP', MagickFormat.Bmp, (bytes) => ascii(bytes, 0, 2) === 'BM'],
  ['ICO', MagickFormat.Ico, (bytes) => bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0],
];
const encoded = new Map();

for (const [name, format, hasSignature] of outputFormats) {
  try {
    const formatInfo = Magick.supportedFormats.find((item) => item.format === format);
    assert(formatInfo?.supportsWriting, `${name} is displayed but this ImageMagick build cannot write it.`);
    const bytes = ImageMagick.read(png, (image) => {
      if (format === MagickFormat.Jpeg) {
        image.backgroundColor = MagickColors.White;
        image.alpha(AlphaAction.Remove);
      }
      image.quality = 82;
      if (format === MagickFormat.WebP) image.settings.setDefine(MagickFormat.WebP, 'method', '6');
      if (format === MagickFormat.Png) image.settings.setDefine(MagickFormat.Png, 'compression-level', '9');
      return image.write(format, (data) => new Uint8Array(data));
    });
    assert(bytes.byteLength > 16 && hasSignature(bytes), `${name} output has an invalid signature.`);
    const formatHint = name === 'ICO' ? MagickFormat.Ico : undefined;
    const decoded = formatHint
      ? ImageMagick.read(bytes, formatHint, (image) => ({ width: image.width, height: image.height }))
      : ImageMagick.read(bytes, (image) => ({ width: image.width, height: image.height }));
    assert(decoded.width === 1 && decoded.height === 1, `${name} could not be decoded by content.`);
    encoded.set(name, bytes.byteLength);
  } catch (error) {
    throw new Error(`${name} codec failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

const svgInput = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="12" height="8"><rect width="12" height="8" fill="#4f4fbd"/></svg>');
const renderer = new Resvg(svgInput, { font: { fontBuffers: [] } });
let svgPng;
try {
  const rendered = renderer.render();
  try {
    svgPng = new Uint8Array(rendered.asPng());
  } finally {
    rendered.free();
  }
} finally {
  renderer.free();
}
const decodedSvg = ImageMagick.read(svgPng, MagickFormat.Png, (image) => ({ width: image.width, height: image.height }));
assert(decodedSvg.width === 12 && decodedSvg.height === 8, 'SVG input was not decoded at its declared size.');

const traceOptions = {
  numberofcolors: 24,
  colorquantcycles: 3,
  ltres: 1,
  qtres: 1,
  pathomit: 6,
  linefilter: true,
  rightangleenhance: true,
  scale: 1,
  strokewidth: 0,
  viewbox: true,
};
let svg = ImageTracer.imagedataToSVG(
  { width: traceSource.width, height: traceSource.height, data: new Uint8ClampedArray(traceSource.pixels) },
  traceOptions,
);
if (!/<path(?:\s|>)/i.test(svg)) {
  svg = ImageTracer.imagedataToSVG(
    { width: traceSource.width, height: traceSource.height, data: new Uint8ClampedArray(traceSource.pixels) },
    { numberofcolors: 24, pathomit: 0, viewbox: true },
  );
}
assert(svg.includes('<svg') && svg.includes('<path'), 'ImageTracer did not create vector paths.');

console.log(`Image engine smoke passed: ${[...encoded.entries()].map(([name, size]) => `${name}=${size}B`).join(', ')}, SVG input and traced SVG output.`);

function ascii(bytes, start, end) {
  return Buffer.from(bytes.subarray(start, end)).toString('ascii');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
