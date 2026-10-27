import { beforeEach, describe, expect, it, vi } from 'vitest';

const write = vi.fn();
const create = vi.fn();
const shareAsync = vi.fn();
const isAvailableAsync = vi.fn(async () => true);

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

vi.mock('expo-file-system', () => {
  class File {
    uri: string;
    constructor(_cache: unknown, name: string) {
      this.uri = `file:///cache/${name}`;
    }
    create = create;
    write = write;
  }
  return { File, Paths: { cache: 'cache://' } };
});

vi.mock('expo-sharing', () => ({
  isAvailableAsync: () => isAvailableAsync(),
  shareAsync: (uri: string, opts?: unknown) => shareAsync(uri, opts),
}));

const PDF = 'data:application/pdf;base64,JVBERi0xLjQK';

describe('parseBase64DataUrl', () => {
  it('reads the type and body of a base64 data URL', async () => {
    const { parseBase64DataUrl } = await import('./shareDataUrlFile');
    expect(parseBase64DataUrl(PDF)).toEqual({ mimeType: 'application/pdf', base64: 'JVBERi0xLjQK' });
    expect(parseBase64DataUrl('https://example.com/a.pdf')).toBeNull();
    expect(parseBase64DataUrl('data:text/plain,hello')).toBeNull();
  });
});

describe('shareDataUrlFile', () => {
  beforeEach(() => {
    write.mockClear();
    create.mockClear();
    shareAsync.mockClear();
    isAvailableAsync.mockReset();
    isAvailableAsync.mockResolvedValue(true);
  });

  it('writes the PDF bytes, not a text note, and shares it as a PDF', async () => {
    const { shareDataUrlFile } = await import('./shareDataUrlFile');
    await shareDataUrlFile({ fileName: 'Myntra-1234abcd.pdf', dataUrl: PDF, dialogTitle: 'Share invoice' });
    expect(create).toHaveBeenCalledWith({ overwrite: true });
    expect(write).toHaveBeenCalledWith('JVBERi0xLjQK', { encoding: 'base64' });
    expect(shareAsync).toHaveBeenCalledWith('file:///cache/Myntra-1234abcd.pdf', {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: 'Share invoice',
    });
  });

  it('says so when the device cannot share, and when the export is not a file', async () => {
    const { shareDataUrlFile } = await import('./shareDataUrlFile');
    isAvailableAsync.mockResolvedValue(false);
    await expect(shareDataUrlFile({ fileName: 'a.pdf', dataUrl: PDF })).rejects.toThrow(/not available/);
    await expect(shareDataUrlFile({ fileName: 'a.pdf', dataUrl: 'https://x/a.pdf' })).rejects.toThrow(
      /did not come back as a file/,
    );
    expect(write).not.toHaveBeenCalled();
    expect(shareAsync).not.toHaveBeenCalled();
  });
});
