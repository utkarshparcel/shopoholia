/**
 * W009 — Receipt snap from vault hero (camera-first OCR path).
 */

export const RECEIPT_SNAP_HERO_LABEL = 'Snap a receipt';
export const RECEIPT_SNAP_HERO_HINT =
  'Photo a warranty or invoice — OCR returns you here with a confidence badge.';

export type ReceiptSnapImage = {
  uri: string;
  source: 'camera' | 'library';
};

type ReceiptPickerOptions = { mediaTypes: Array<'images'>; quality: number };
type ReceiptPickerResult = Promise<{
  canceled: boolean;
  assets?: Array<{ uri?: string }> | null;
}>;

/** The slice of expo-image-picker this flow uses. */
export type ReceiptImagePicker = {
  launchCameraAsync: (opts: ReceiptPickerOptions) => ReceiptPickerResult;
  launchImageLibraryAsync: (opts: ReceiptPickerOptions) => ReceiptPickerResult;
};

/**
 * Prefer camera; fall back to library if camera is cancelled or unavailable.
 * Pass `picker` in tests to avoid loading expo-image-picker.
 */
export async function pickReceiptSnapImage(
  picker: ReceiptImagePicker,
): Promise<ReceiptSnapImage | null> {
  try {
    const cam = await picker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!cam.canceled && cam.assets?.[0]?.uri) {
      return { uri: cam.assets[0].uri, source: 'camera' };
    }
  } catch {
    // fall through to library
  }

  const lib = await picker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
  });
  if (lib.canceled || !lib.assets?.[0]?.uri) return null;
  return { uri: lib.assets[0].uri, source: 'library' };
}
