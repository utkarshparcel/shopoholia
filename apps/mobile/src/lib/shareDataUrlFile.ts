import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const BASE64_DATA_URL = /^data:([\w.+-]+\/[\w.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/;

/** The media type and base64 body of a `data:<type>;base64,…` URL, or null. */
export function parseBase64DataUrl(url: string): { mimeType: string; base64: string } | null {
  const m = BASE64_DATA_URL.exec(url.trim());
  return m ? { mimeType: m[1]!, base64: m[2]! } : null;
}

/**
 * Save a base64 `data:` URL (the receipt PDF export) as a real file and open the
 * share sheet. Throws with a readable message when the URL is not a file or the
 * device cannot share, so the caller can say so instead of pretending.
 */
export async function shareDataUrlFile(input: {
  fileName: string;
  dataUrl: string;
  dialogTitle?: string;
}): Promise<void> {
  const parsed = parseBase64DataUrl(input.dataUrl);
  if (!parsed) throw new Error('The export did not come back as a file.');

  if (Platform.OS === 'web') {
    // Browsers block opening data: URLs in a tab, but a download link works.
    const a = document.createElement('a');
    a.href = input.dataUrl;
    a.download = input.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  const file = new File(Paths.cache, input.fileName);
  file.create({ overwrite: true });
  file.write(parsed.base64, { encoding: 'base64' });
  await Sharing.shareAsync(file.uri, {
    mimeType: parsed.mimeType,
    ...(parsed.mimeType === 'application/pdf' ? { UTI: 'com.adobe.pdf' } : {}),
    dialogTitle: input.dialogTitle,
  });
}
