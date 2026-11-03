/** A photo format the API stores, as detected from the file's own bytes. */
export type ImageType = { contentType: string; extension: string };

const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1", "heif"]);

/**
 * The image type of `bytes` by its magic number: JPEG, PNG, WebP or HEIC/HEIF. Null for
 * anything else, whatever the client said its type was.
 */
export function detectImageType(bytes: Buffer): ImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { contentType: "image/jpeg", extension: "jpg" };
  }
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { contentType: "image/png", extension: "png" };
  }
  if (bytes.length >= 12 && bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP") {
    return { contentType: "image/webp", extension: "webp" };
  }
  if (bytes.length >= 12 && bytes.toString("latin1", 4, 8) === "ftyp" && HEIF_BRANDS.has(bytes.toString("latin1", 8, 12))) {
    return { contentType: "image/heic", extension: "heic" };
  }
  return null;
}
