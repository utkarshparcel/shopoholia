import { describe, expect, it } from 'vitest';

import {
  INITIAL_EXPORT_PROGRESS,
  exportCanRetry,
  exportProgressLabel,
  exportShowsIndeterminate,
  reduceExportProgress,
} from './exportProgress';

describe('W077 export progress', () => {
  it('walks preparing → sharing → ready (shared or local)', () => {
    let state = INITIAL_EXPORT_PROGRESS;
    state = reduceExportProgress(state, { type: 'start' });
    expect(state.phase).toBe('preparing');
    expect(exportShowsIndeterminate(state.phase)).toBe(true);
    expect(exportProgressLabel(state.phase)).toBe('Preparing…');

    state = reduceExportProgress(state, { type: 'fetched' });
    expect(state.phase).toBe('sharing');
    expect(exportShowsIndeterminate(state.phase)).toBe(true);

    state = reduceExportProgress(state, {
      type: 'shared',
      shared: true,
      uri: 'file:///cache/out.json',
    });
    expect(state.phase).toBe('ready');
    expect(state.shared).toBe(true);
    expect(state.message).toMatch(/share sheet/i);
    expect(exportCanRetry(state.phase)).toBe(false);

    const local = reduceExportProgress(INITIAL_EXPORT_PROGRESS, { type: 'start' });
    const readyLocal = reduceExportProgress(
      reduceExportProgress(local, { type: 'fetched' }),
      { type: 'shared', shared: false, uri: 'file:///cache/out.json' },
    );
    expect(readyLocal.message).toContain('file:///cache/out.json');
  });

  it('surfaces error and allows retry', () => {
    const failed = reduceExportProgress(INITIAL_EXPORT_PROGRESS, {
      type: 'fail',
      message: 'Export blocked',
    });
    expect(failed.phase).toBe('error');
    expect(exportCanRetry(failed.phase)).toBe(true);
    expect(exportProgressLabel(failed.phase)).toBe('Export failed');
    expect(reduceExportProgress(failed, { type: 'reset' })).toEqual(INITIAL_EXPORT_PROGRESS);
  });
});
