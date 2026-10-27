import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export type ShareTextFileInput = {
  fileName: string;
  contents: string;
  mimeType: string;
  dialogTitle?: string;
};

/**
 * Write text to the cache directory and open the system share sheet when available.
 * Returns the local file URI either way so callers can surface a save path in UI.
 */
export async function shareTextFile(input: ShareTextFileInput): Promise<{ uri: string; shared: boolean }> {
  const file = new File(Paths.cache, input.fileName);
  file.create({ overwrite: true });
  file.write(input.contents);

  const available = await Sharing.isAvailableAsync();
  if (available) {
    await Sharing.shareAsync(file.uri, {
      mimeType: input.mimeType,
      dialogTitle: input.dialogTitle,
    });
    return { uri: file.uri, shared: true };
  }

  return { uri: file.uri, shared: false };
}
