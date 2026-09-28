/// <reference lib="webworker" />

import {
  AlphaAction,
  Channels,
  CompositeOperator,
  EvaluateOperator,
  Gravity,
  ImageMagick,
  MagickColors,
  MagickFormat,
  MagickGeometry,
  Point,
  initializeImageMagick,
  type IMagickImage,
  type MagickFormat as MagickFormatType,
} from '@imagemagick/magick-wasm';
import magickWasmUrl from '@imagemagick/magick-wasm/magick.wasm?url';

import { maxImageDimension, type ImageConversionOptions } from './image-types';
import { detectMagickFormat } from './image-content';
import { rasterizeSvg } from './svg-rasterizer';

interface RequestMessage {
  id: number;
  bytes: ArrayBuffer;
  options: ImageConversionOptions;
}

let initialization: Promise<void> | undefined;

function initialize(): Promise<void> {
  initialization ??= initializeImageMagick(new URL(magickWasmUrl, self.location.href));
  return initialization;
}

const formats: Record<Exclude<ImageConversionOptions['outputFormat'], 'svg'>, MagickFormatType> = {
  png: MagickFormat.Png,
  jpg: MagickFormat.Jpeg,
  webp: MagickFormat.WebP,
  avif: MagickFormat.Avif,
  gif: MagickFormat.Gif,
  tiff: MagickFormat.Tiff,
  bmp: MagickFormat.Bmp,
  ico: MagickFormat.Ico,
};

self.onmessage = async (event: MessageEvent<RequestMessage>) => {
  const { id, bytes, options } = event.data;
  try {
    await initialize();
    const result = await convert(new Uint8Array(bytes), options);
    self.postMessage({ id, ok: true, ...result, bytes: result.bytes.buffer }, [result.bytes.buffer]);
  } catch (error) {
    self.postMessage({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};

async function convert(input: Uint8Array, options: ImageConversionOptions) {
  let readableInput = input;
  let formatHint = detectMagickFormat(input);
  let detectedFormat: string | undefined;
  if (formatHint === MagickFormat.Svg) {
    readableInput = await rasterizeSvg(input);
    formatHint = MagickFormat.Png;
    detectedFormat = MagickFormat.Svg;
  }
  const transform = async (image: IMagickImage) => {
    const inputFormat = detectedFormat ?? image.format;

    if (options.scalePercent && options.scalePercent !== 100) {
      const width = Math.max(1, Math.round(image.width * options.scalePercent / 100));
      const height = Math.max(1, Math.round(image.height * options.scalePercent / 100));
      if (width > maxImageDimension || height > maxImageDimension) {
        throw new Error(`Scaled dimensions cannot exceed ${maxImageDimension} pixels.`);
      }
      image.resize(width, height);
    } else if (options.width || options.height) {
      const geometry = new MagickGeometry(options.width ?? 0, options.height ?? 0);
      geometry.ignoreAspectRatio = options.resizeMode === 'stretch';
      geometry.fillArea = options.resizeMode === 'cover' && Boolean(options.width && options.height);
      image.resize(geometry);
      if (options.resizeMode === 'cover' && options.width && options.height) {
        image.crop(options.width, options.height, Gravity.Center);
      }
    }
    if (options.watermark?.bytes.byteLength) {
      await ImageMagick.read(options.watermark.bytes, (watermark) => {
        const width = Math.max(1, Math.round(image.width * Math.min(100, Math.max(5, options.watermark!.scalePercent)) / 100));
        watermark.resize(width, 0);
        if (!watermark.hasAlpha) watermark.alpha(AlphaAction.Activate);
        watermark.evaluate(Channels.Alpha, EvaluateOperator.Multiply, Math.min(1, Math.max(0.05, options.watermark!.opacity / 100)));
        const padding = Math.max(8, Math.round(image.width * 0.02));
        const point = watermarkPoint(image.width, image.height, watermark.width, watermark.height, padding, options.watermark!.position);
        image.composite(watermark, CompositeOperator.Over, point);
      });
    }
    if (options.stripMetadata) image.strip();

    if (options.outputFormat === 'svg') {
      const pixels = image.getPixels((collection) =>
        collection.toByteArray(0, 0, image.width, image.height, 'RGBA'),
      );
      if (!pixels) throw new Error('Could not read image pixels for SVG tracing.');
      const { default: ImageTracer } = await import('imagetracerjs');
      const imageData = { width: image.width, height: image.height, data: new Uint8ClampedArray(pixels) };
      const tracingOptions = {
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
      let svg = ImageTracer.imagedataToSVG(imageData, tracingOptions);
      // ImageTracer deliberately drops paths smaller than `pathomit`. Retry
      // without that optimization so icons and 1x1/flat images still produce
      // an editable vector instead of an empty SVG document.
      if (!/<path(?:\s|>)/i.test(svg)) {
        svg = ImageTracer.imagedataToSVG(imageData, {
          numberofcolors: 24,
          pathomit: 0,
          viewbox: true,
        });
      }
      if (!/<path(?:\s|>)/i.test(svg)) {
        throw new Error('SVG tracing did not produce a vector path.');
      }
      return { bytes: new TextEncoder().encode(svg), inputFormat, outputFormat: options.outputFormat, width: image.width, height: image.height };
    }

    const format = formats[options.outputFormat];
    if (format === MagickFormat.Jpeg) {
      image.backgroundColor = MagickColors.White;
      image.alpha(AlphaAction.Remove);
    }
    if (format === MagickFormat.Jpeg || format === MagickFormat.WebP || format === MagickFormat.Avif) {
      image.quality = options.quality;
    }
    if (format === MagickFormat.WebP) {
      image.settings.setDefine(MagickFormat.WebP, 'method', '6');
    }
    if (format === MagickFormat.Png) {
      image.settings.setDefine(MagickFormat.Png, 'compression-level', '9');
    }
    const output = image.write(format, (data) => new Uint8Array(data));
    return { bytes: output, inputFormat, outputFormat: options.outputFormat, width: image.width, height: image.height };
  };
  return formatHint
    ? ImageMagick.read(readableInput, formatHint, transform)
    : ImageMagick.read(readableInput, transform);
}

function watermarkPoint(imageWidth: number, imageHeight: number, width: number, height: number, padding: number, position: NonNullable<ImageConversionOptions['watermark']>['position']): Point {
  return switchPoint(position, {
    northwest: new Point(padding, padding),
    northeast: new Point(Math.max(0, imageWidth - width - padding), padding),
    center: new Point(Math.max(0, Math.round((imageWidth - width) / 2)), Math.max(0, Math.round((imageHeight - height) / 2))),
    southwest: new Point(padding, Math.max(0, imageHeight - height - padding)),
    southeast: new Point(Math.max(0, imageWidth - width - padding), Math.max(0, imageHeight - height - padding)),
  });
}

function switchPoint(key: NonNullable<ImageConversionOptions['watermark']>['position'], values: Record<NonNullable<ImageConversionOptions['watermark']>['position'], Point>): Point {
  return values[key];
}

export {};
