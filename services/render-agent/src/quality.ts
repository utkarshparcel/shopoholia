import { readFile } from "node:fs/promises";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";

/**
 * Checks on a finished render before it goes up to R2. A render that fails one is reported as a
 * retryable failure (`quality:<check>`) and never uploaded. Pure JS (jpeg-js, pngjs): no native
 * modules, so the Mac install stays `pnpm install`.
 *
 * Face similarity (is it still the same person?) and safety need an ML model and are not here:
 * see the README.
 */

/** The shortest side a render may have, in pixels. */
export const MIN_SHORT_SIDE_PX = 512;

/**
 * Below this spread of brightness (standard deviation, 0-255) across the image, it is blank: one
 * flat colour, or a flat colour with compression noise. A real photo is far above it.
 */
export const MIN_LUMA_STDDEV = 6;

/**
 * At or below this mean difference per channel (0-255) from the model photo, the render is the
 * model photo again (a copy, a re-encode or a resize), not a try-on. Dressing someone in a
 * garment changes far more than this.
 */
export const MAX_UNCHANGED_MEAN_DIFF = 1;

/** Images are compared as this many by this many block averages: resize- and noise-proof. */
const GRID = 64;

/** jpeg-js refuses to decode beyond these (a corrupt or hostile header). */
const MAX_DECODE_MEGAPIXELS = 50;
const MAX_DECODE_MEMORY_MB = 1024;

export type ImageFormat = "jpeg" | "png";

export type QualityCheck = "format" | "dimensions" | "blank" | "unchanged";

/** A render that failed a check; another attempt may pass, so it is retryable. */
export class QualityCheckError extends Error {
  constructor(
    readonly check: QualityCheck,
    detail: string,
  ) {
    super(`quality:${check}: ${detail}`);
    this.name = "QualityCheckError";
  }
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** JPEG or PNG by magic bytes; null for anything else. */
export function sniffFormat(bytes: Uint8Array): ImageFormat | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && PNG_SIGNATURE.every((b, i) => bytes[i] === b)) return "png";
  return null;
}

/** Width and height from the header (PNG IHDR, a JPEG SOF marker); null when it can't be read. */
export function readDimensions(bytes: Uint8Array, format: ImageFormat): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (format === "png") {
    // Signature, then the IHDR chunk: length (4), "IHDR" (4), width (4), height (4).
    if (bytes.length < 24 || String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR") return null;
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1]!;
    // Fill bytes, and markers with no length (TEM, RSTn).
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // End of image or scan data before a frame.
    const length = view.getUint16(i + 2);
    if (length < 2) return null;
    // SOF0-SOF15, except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (i + 9 > bytes.length) return null;
      return { height: view.getUint16(i + 5), width: view.getUint16(i + 7) };
    }
    i += 2 + length;
  }
  return null;
}

export type DecodedImage = { width: number; height: number; data: Uint8Array };

/** RGBA pixels. Throws on a file that isn't a complete JPEG or PNG. */
export function decodeImage(bytes: Uint8Array, format: ImageFormat): DecodedImage {
  if (format === "jpeg") {
    const image = jpeg.decode(bytes, {
      useTArray: true,
      formatAsRGBA: true,
      maxResolutionInMP: MAX_DECODE_MEGAPIXELS,
      maxMemoryUsageInMB: MAX_DECODE_MEMORY_MB,
    });
    return { width: image.width, height: image.height, data: image.data };
  }
  const image = PNG.sync.read(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  return { width: image.width, height: image.height, data: new Uint8Array(image.data) };
}

/** The image as GRID×GRID block averages of R, G and B (alpha is ignored). */
function blockAverages(image: DecodedImage): Float64Array {
  const out = new Float64Array(GRID * GRID * 3);
  const counts = new Float64Array(GRID * GRID);
  // Large images are sampled on a stride: a few hundred thousand pixels are plenty.
  const step = Math.max(1, Math.floor(Math.sqrt((image.width * image.height) / 262_144)));
  for (let y = 0; y < image.height; y += step) {
    const gy = Math.min(GRID - 1, Math.floor((y * GRID) / image.height));
    for (let x = 0; x < image.width; x += step) {
      const gx = Math.min(GRID - 1, Math.floor((x * GRID) / image.width));
      const cell = gy * GRID + gx;
      const p = (y * image.width + x) * 4;
      out[cell * 3] += image.data[p]!;
      out[cell * 3 + 1] += image.data[p + 1]!;
      out[cell * 3 + 2] += image.data[p + 2]!;
      counts[cell] += 1;
    }
  }
  for (let cell = 0; cell < counts.length; cell += 1) {
    const n = counts[cell] || 1;
    out[cell * 3] /= n;
    out[cell * 3 + 1] /= n;
    out[cell * 3 + 2] /= n;
  }
  return out;
}

/** Standard deviation of brightness across the image's blocks (0-255). */
export function lumaStdDev(image: DecodedImage): number {
  const blocks = blockAverages(image);
  const luma: number[] = [];
  for (let i = 0; i < blocks.length; i += 3) {
    luma.push(0.299 * blocks[i]! + 0.587 * blocks[i + 1]! + 0.114 * blocks[i + 2]!);
  }
  const mean = luma.reduce((a, b) => a + b, 0) / luma.length;
  return Math.sqrt(luma.reduce((a, b) => a + (b - mean) ** 2, 0) / luma.length);
}

/**
 * Mean difference per channel (0-255) between two images, block by block, or null when their
 * shapes differ too much to be the same picture (more than 2% in aspect ratio).
 */
export function meanDifference(a: DecodedImage, b: DecodedImage): number | null {
  const ratio = (a.width / a.height) / (b.width / b.height);
  if (Math.abs(ratio - 1) > 0.02) return null;
  const blocksA = blockAverages(a);
  const blocksB = blockAverages(b);
  let sum = 0;
  for (let i = 0; i < blocksA.length; i += 1) sum += Math.abs(blocksA[i]! - blocksB[i]!);
  return sum / blocksA.length;
}

function sameBytes(a: Uint8Array, b: Uint8Array) {
  return a.length === b.length && Buffer.compare(a, b) === 0;
}

const FORMAT_FOR_CONTENT_TYPE: Record<string, ImageFormat> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
};

/**
 * Throws QualityCheckError unless `output` is a real image of the type the API asked for, at
 * least MIN_SHORT_SIDE_PX on its short side, not blank, and not the model photo again.
 */
export function checkRenderQuality(input: { output: Uint8Array; modelImage: Uint8Array; contentType: string }): void {
  const { output, modelImage } = input;
  const format = sniffFormat(output);
  if (!format) throw new QualityCheckError("format", "the output is not a JPEG or PNG");
  const expected = FORMAT_FOR_CONTENT_TYPE[input.contentType.toLowerCase()];
  if (expected && expected !== format) {
    throw new QualityCheckError("format", `the output is a ${format.toUpperCase()}, the upload is ${input.contentType}`);
  }
  const size = readDimensions(output, format);
  if (!size || size.width === 0 || size.height === 0) {
    throw new QualityCheckError("format", "the output's dimensions can't be read");
  }
  if (Math.min(size.width, size.height) < MIN_SHORT_SIDE_PX) {
    throw new QualityCheckError(
      "dimensions",
      `${size.width}x${size.height} is under ${MIN_SHORT_SIDE_PX}px on its short side`,
    );
  }
  if (sameBytes(output, modelImage)) throw new QualityCheckError("unchanged", "the output is the model photo");

  let decoded: DecodedImage;
  try {
    decoded = decodeImage(output, format);
  } catch (error) {
    throw new QualityCheckError("format", `the output can't be decoded (${error instanceof Error ? error.message : "unknown"})`);
  }
  const spread = lumaStdDev(decoded);
  if (spread < MIN_LUMA_STDDEV) {
    throw new QualityCheckError("blank", `the output is near-uniform (brightness spread ${spread.toFixed(1)})`);
  }

  // The model photo was readable enough to render from; if it can't be decoded here, skip this one.
  const modelFormat = sniffFormat(modelImage);
  let model: DecodedImage | null = null;
  try {
    model = modelFormat ? decodeImage(modelImage, modelFormat) : null;
  } catch {
    model = null;
  }
  const difference = model ? meanDifference(decoded, model) : null;
  if (difference !== null && difference <= MAX_UNCHANGED_MEAN_DIFF) {
    throw new QualityCheckError(
      "unchanged",
      `the output is the model photo again (mean difference ${difference.toFixed(2)})`,
    );
  }
}

/** checkRenderQuality on the files on disk. */
export async function checkRenderFiles(input: { outputPath: string; modelImagePath: string; contentType: string }) {
  const [output, modelImage] = await Promise.all([readFile(input.outputPath), readFile(input.modelImagePath)]);
  checkRenderQuality({ output, modelImage, contentType: input.contentType });
}
