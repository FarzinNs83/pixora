declare module 'imagetracerjs' {
  interface TraceImageData {
    width: number;
    height: number;
    data: Uint8ClampedArray;
  }

  interface TraceOptions {
    numberofcolors?: number;
    colorquantcycles?: number;
    ltres?: number;
    qtres?: number;
    pathomit?: number;
    linefilter?: boolean;
    rightangleenhance?: boolean;
    scale?: number;
    strokewidth?: number;
    viewbox?: boolean;
  }

  const ImageTracer: {
    imagedataToSVG(imageData: TraceImageData, options?: TraceOptions | string): string;
  };

  export default ImageTracer;
}
