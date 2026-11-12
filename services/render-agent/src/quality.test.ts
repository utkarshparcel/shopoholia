import { describe, expect, it } from "vitest";
import {
  checkRenderQuality,
  MIN_SHORT_SIDE_PX,
  QualityCheckError,
  readDimensions,
  sniffFormat,
  type QualityCheck,
} from "./quality.js";
import { flat, photo, toJpeg, toPng } from "./test-images.js";

const MODEL = toJpeg(photo(768, 1024));
/** The same person in a red garment instead of a blue one. */
const RENDER = toJpeg(photo(768, 1024, [180, 30, 40]));

function failure(output: Uint8Array, options: { modelImage?: Uint8Array; contentType?: string } = {}): QualityCheck | null {
  try {
    checkRenderQuality({ output, modelImage: options.modelImage ?? MODEL, contentType: options.contentType ?? "image/jpeg" });
    return null;
  } catch (error) {
    if (!(error instanceof QualityCheckError)) throw error;
    expect(error.message).toMatch(new RegExp(`^quality:${error.check}: `));
    return error.check;
  }
}

describe("render quality checks", () => {
  it("passes a real render", () => {
    expect(failure(RENDER)).toBeNull();
    expect(failure(toPng(photo(768, 1024, [180, 30, 40])), { contentType: "image/png" })).toBeNull();
  });

  describe("format", () => {
    it("reads JPEG and PNG magic bytes and dimensions", () => {
      expect(sniffFormat(RENDER)).toBe("jpeg");
      expect(readDimensions(RENDER, "jpeg")).toEqual({ width: 768, height: 1024 });
      const png = toPng(photo(600, 520));
      expect(sniffFormat(png)).toBe("png");
      expect(readDimensions(png, "png")).toEqual({ width: 600, height: 520 });
      expect(sniffFormat(new TextEncoder().encode("<html>error</html>"))).toBeNull();
    });

    it("fails anything that is not a JPEG or PNG", () => {
      expect(failure(new TextEncoder().encode('{"error":"out of memory"}'))).toBe("format");
      expect(failure(new Uint8Array())).toBe("format");
      // GIF and WebP are images, but not ones the app is given.
      expect(failure(new TextEncoder().encode("GIF89a\x01\x00\x01\x00"))).toBe("format");
    });

    it("fails a JPEG header with no frame, and a truncated file", () => {
      expect(failure(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBe("format");
      // The header (with its dimensions) is intact but the scan data is cut off.
      const cut = RENDER.subarray(0, Math.floor(RENDER.length / 3));
      expect(readDimensions(cut, "jpeg")).toEqual({ width: 768, height: 1024 });
      expect(failure(cut)).toBe("format");
      const png = toPng(photo(768, 1024, [180, 30, 40]));
      expect(failure(png.subarray(0, 200), { contentType: "image/png" })).toBe("format");
    });

    it("fails a PNG for a JPEG upload (the signed PUT is for image/jpeg)", () => {
      expect(failure(toPng(photo(768, 1024, [180, 30, 40])))).toBe("format");
    });
  });

  describe("dimensions", () => {
    it(`fails under ${MIN_SHORT_SIDE_PX}px on the short side, and passes at it`, () => {
      expect(failure(toJpeg(photo(1024, MIN_SHORT_SIDE_PX - 1, [180, 30, 40])))).toBe("dimensions");
      expect(failure(toJpeg(photo(256, 256, [180, 30, 40])))).toBe("dimensions");
      expect(failure(toJpeg(photo(MIN_SHORT_SIDE_PX, 700, [180, 30, 40])))).toBeNull();
    });
  });

  describe("blank", () => {
    it("fails a flat image, black, white or grey", () => {
      expect(failure(toJpeg(flat(768, 1024, [0, 0, 0])))).toBe("blank");
      expect(failure(toJpeg(flat(768, 1024, [255, 255, 255])))).toBe("blank");
      expect(failure(toPng(flat(768, 1024, [128, 128, 128])), { contentType: "image/png" })).toBe("blank");
    });

    it("fails a near-uniform image with compression noise", () => {
      const noisy = flat(768, 1024, [120, 120, 120]);
      for (let p = 0; p < noisy.data.length; p += 4) {
        const n = (p * 2654435761) % 7;
        noisy.data[p] = 117 + n;
        noisy.data[p + 1] = 117 + n;
        noisy.data[p + 2] = 117 + n;
      }
      expect(failure(toJpeg(noisy, 60))).toBe("blank");
    });
  });

  describe("unchanged", () => {
    it("fails the model photo byte for byte", () => {
      expect(failure(MODEL)).toBe("unchanged");
    });

    it("fails the model photo re-encoded, or resized", () => {
      expect(failure(toJpeg(photo(768, 1024), 70))).toBe("unchanged");
      expect(failure(toPng(photo(768, 1024)), { contentType: "image/png" })).toBe("unchanged");
      expect(failure(toJpeg(photo(1152, 1536)))).toBe("unchanged");
    });

    it("passes a render the same shape as the model photo with a different garment, and any other shape", () => {
      expect(failure(toJpeg(photo(768, 1024, [60, 60, 70])))).toBeNull();
      // A close shade of the same colour is still a change.
      expect(failure(toJpeg(photo(768, 1024, [50, 80, 150])))).toBeNull();
      // A different crop of the scene is a different picture.
      expect(failure(toJpeg(photo(1024, 1024)))).toBeNull();
    });

    it("skips the comparison when the model photo can't be decoded", () => {
      expect(failure(RENDER, { modelImage: new Uint8Array([1, 2, 3]) })).toBeNull();
    });
  });
});
