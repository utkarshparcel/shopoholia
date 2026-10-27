import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';
import { mapLimit } from '@worn/shared';

/** Long edge of an uploaded wardrobe photo. Enough for try-on and tagging, a fraction of a 12MP original. */
export const UPLOAD_LONG_EDGE = 1600;
export const UPLOAD_JPEG_QUALITY = 0.8;
/** Photos resized at once; each decode holds a full-size bitmap in memory. */
export const PREP_CONCURRENCY = 2;

export type PickedPhoto = { uri: string; width?: number | null; height?: number | null };

/** The resize that brings the long edge down to `UPLOAD_LONG_EDGE`, or null when it already fits. */
export function uploadResize(
  width: number | null | undefined,
  height: number | null | undefined,
): { width: number } | { height: number } | null {
  const w = Number.isFinite(width) && (width ?? 0) > 0 ? (width as number) : 0;
  const h = Number.isFinite(height) && (height ?? 0) > 0 ? (height as number) : 0;
  if (!w || !h) return null;
  if (Math.max(w, h) <= UPLOAD_LONG_EDGE) return null;
  return w >= h ? { width: UPLOAD_LONG_EDGE } : { height: UPLOAD_LONG_EDGE };
}

async function saveJpeg(image: ImageRef): Promise<string> {
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: UPLOAD_JPEG_QUALITY });
  return saved.uri;
}

/**
 * A JPEG copy of the photo with its long edge at most `UPLOAD_LONG_EDGE`.
 * Re-encoding also turns HEIC from iPhones into JPEG, which the upload declares, and drops the
 * original's EXIF, so the GPS position a camera photo carries never leaves the phone.
 */
export async function preparePhotoForUpload(photo: PickedPhoto): Promise<string> {
  const context = ImageManipulator.manipulate(photo.uri);
  try {
    const size = uploadResize(photo.width, photo.height);
    if (size) context.resize(size);
    const image = await context.renderAsync();
    try {
      // A caller with only a uri learns the size once the photo is decoded.
      const late = size ? null : uploadResize(image.width, image.height);
      if (!late) return await saveJpeg(image);
      const again = ImageManipulator.manipulate(image);
      try {
        again.resize(late);
        const smaller = await again.renderAsync();
        try {
          return await saveJpeg(smaller);
        } finally {
          smaller.release();
        }
      } finally {
        again.release();
      }
    } finally {
      image.release();
    }
  } finally {
    context.release();
  }
}

/** Prepares photos a few at a time, keeping their order. A photo that can't be read rejects the batch. */
export function preparePhotosForUpload(photos: readonly PickedPhoto[]): Promise<string[]> {
  return mapLimit(photos, PREP_CONCURRENCY, (p) => preparePhotoForUpload(p));
}
