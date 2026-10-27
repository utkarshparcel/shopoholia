import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({
  resize: [] as unknown[],
  save: [] as unknown[],
  released: 0,
  active: 0,
  maxActive: 0,
  failUri: null as string | null,
  /** What decoding the photo finds, for callers that pass no size. */
  decoded: { width: 1, height: 1 },
}));

vi.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
  ImageManipulator: {
    manipulate: (source: string | { uri: string }) => {
      const uri = typeof source === 'string' ? source : source.uri;
      const context = {
        resize: (size: unknown) => {
          calls.resize.push(size);
          return context;
        },
        renderAsync: async () => {
          calls.active += 1;
          calls.maxActive = Math.max(calls.maxActive, calls.active);
          await new Promise((r) => setTimeout(r, 5));
          calls.active -= 1;
          if (uri === calls.failUri) throw new Error('decode failed');
          return {
            uri,
            ...calls.decoded,
            saveAsync: async (opts: unknown) => {
              calls.save.push(opts);
              return { uri: `${uri}.jpg`, width: 1, height: 1 };
            },
            release: () => {
              calls.released += 1;
            },
          };
        },
        release: () => {
          calls.released += 1;
        },
      };
      return context;
    },
  },
}));

import {
  PREP_CONCURRENCY,
  preparePhotoForUpload,
  preparePhotosForUpload,
  UPLOAD_LONG_EDGE,
  uploadResize,
} from './photoPrep';

beforeEach(() => {
  calls.resize = [];
  calls.save = [];
  calls.released = 0;
  calls.active = 0;
  calls.maxActive = 0;
  calls.failUri = null;
  calls.decoded = { width: 1, height: 1 };
});

describe('uploadResize', () => {
  it('caps the long edge and leaves small or unknown sizes alone', () => {
    expect(uploadResize(4032, 3024)).toEqual({ width: UPLOAD_LONG_EDGE });
    expect(uploadResize(3024, 4032)).toEqual({ height: UPLOAD_LONG_EDGE });
    expect(uploadResize(1200, 900)).toBeNull();
    expect(uploadResize(undefined, 4000)).toBeNull();
    expect(uploadResize(Number.NaN, 4000)).toBeNull();
  });
});

describe('preparePhotoForUpload', () => {
  it('resizes, saves as JPEG and releases native objects', async () => {
    await expect(preparePhotoForUpload({ uri: 'file:///a', width: 4032, height: 3024 })).resolves.toBe(
      'file:///a.jpg',
    );
    expect(calls.resize).toEqual([{ width: UPLOAD_LONG_EDGE }]);
    expect(calls.save).toEqual([{ format: 'jpeg', compress: 0.8 }]);
    expect(calls.released).toBe(2);
  });

  it('resizes a photo passed without its size once decoding shows it is too big', async () => {
    calls.decoded = { width: 3024, height: 4032 };
    await expect(preparePhotoForUpload({ uri: 'file:///big' })).resolves.toBe('file:///big.jpg');
    expect(calls.resize).toEqual([{ height: UPLOAD_LONG_EDGE }]);
    expect(calls.save).toEqual([{ format: 'jpeg', compress: 0.8 }]);
    expect(calls.released).toBe(4);
  });

  it('re-encodes a small photo passed without its size, without resizing it', async () => {
    calls.decoded = { width: 800, height: 600 };
    await expect(preparePhotoForUpload({ uri: 'file:///small' })).resolves.toBe('file:///small.jpg');
    expect(calls.resize).toEqual([]);
    expect(calls.save).toEqual([{ format: 'jpeg', compress: 0.8 }]);
    expect(calls.released).toBe(2);
  });

  it('releases the context when decoding fails', async () => {
    calls.failUri = 'file:///bad';
    await expect(preparePhotoForUpload({ uri: 'file:///bad' })).rejects.toThrow('decode failed');
    expect(calls.released).toBe(1);
  });
});

describe('preparePhotosForUpload', () => {
  it('keeps order and runs at most PREP_CONCURRENCY at once', async () => {
    const photos = Array.from({ length: 7 }, (_, i) => ({ uri: `file:///p${i}`, width: 3000, height: 2000 }));
    const out = await preparePhotosForUpload(photos);
    expect(out).toEqual(photos.map((p) => `${p.uri}.jpg`));
    expect(calls.maxActive).toBeLessThanOrEqual(PREP_CONCURRENCY);
    expect(calls.maxActive).toBeGreaterThan(0);
  });
});
