/** Synthetic photos for the tests (not part of the build: see tsconfig.json). */
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import type { DecodedImage } from "./quality.js";

/**
 * A photo-like image: a vertical gradient backdrop with a "person" (an ellipse and a body block)
 * whose garment is `garment` (RGB).
 */
export function photo(width: number, height: number, garment: [number, number, number] = [40, 70, 160]): DecodedImage {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = (y * width + x) * 4;
      let rgb: [number, number, number] = [230 - (y * 80) / height, 225 - (y * 70) / height, 215 - (x * 40) / width];
      const cx = width / 2;
      const head = ((x - cx) / (width * 0.12)) ** 2 + ((y - height * 0.18) / (height * 0.09)) ** 2 <= 1;
      const body = Math.abs(x - cx) < width * 0.2 && y > height * 0.28 && y < height * 0.75;
      if (head) rgb = [205, 160, 130];
      else if (body) rgb = garment;
      data.set([Math.round(rgb[0]), Math.round(rgb[1]), Math.round(rgb[2]), 255], p);
    }
  }
  return { width, height, data };
}

export function flat(width: number, height: number, rgb: [number, number, number]): DecodedImage {
  const data = new Uint8Array(width * height * 4);
  for (let p = 0; p < data.length; p += 4) data.set([...rgb, 255], p);
  return { width, height, data };
}

export function toJpeg(image: DecodedImage, quality = 90): Uint8Array {
  return new Uint8Array(jpeg.encode({ width: image.width, height: image.height, data: image.data }, quality).data);
}

export function toPng(image: DecodedImage): Uint8Array {
  const png = new PNG({ width: image.width, height: image.height });
  png.data = Buffer.from(image.data);
  return new Uint8Array(PNG.sync.write(png));
}
