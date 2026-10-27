import { beforeEach, describe, expect, it, vi } from 'vitest';

const write = vi.fn();
const create = vi.fn();
const shareAsync = vi.fn();
const isAvailableAsync = vi.fn(async () => true);

vi.mock('expo-file-system', () => {
  class File {
    uri: string;
    constructor(_cache: unknown, name: string) {
      this.uri = `file:///cache/${name}`;
    }
    create = create;
    write = write;
  }
  return {
    File,
    Paths: { cache: 'cache://' },
  };
});

vi.mock('expo-sharing', () => ({
  isAvailableAsync: () => isAvailableAsync(),
  shareAsync: (uri: string, opts?: { mimeType?: string; dialogTitle?: string }) =>
    shareAsync(uri, opts),
}));

describe('shareTextFile', () => {
  beforeEach(() => {
    write.mockClear();
    create.mockClear();
    shareAsync.mockClear();
    isAvailableAsync.mockReset();
    isAvailableAsync.mockResolvedValue(true);
  });

  it('writes JSON and shares when available', async () => {
    const { shareTextFile } = await import('./shareFile');
    const result = await shareTextFile({
      fileName: 'export.json',
      contents: '{"ok":true}',
      mimeType: 'application/json',
      dialogTitle: 'Export',
    });

    expect(create).toHaveBeenCalledWith({ overwrite: true });
    expect(write).toHaveBeenCalledWith('{"ok":true}');
    expect(shareAsync).toHaveBeenCalledWith('file:///cache/export.json', {
      mimeType: 'application/json',
      dialogTitle: 'Export',
    });
    expect(result).toEqual({ uri: 'file:///cache/export.json', shared: true });
  });

  it('skips share sheet when sharing is unavailable', async () => {
    isAvailableAsync.mockResolvedValue(false);
    const { shareTextFile } = await import('./shareFile');
    const result = await shareTextFile({
      fileName: 'ledger.csv',
      contents: 'a,b\n1,2',
      mimeType: 'text/csv',
    });

    expect(shareAsync).not.toHaveBeenCalled();
    expect(result.shared).toBe(false);
    expect(result.uri).toContain('ledger.csv');
  });
});
