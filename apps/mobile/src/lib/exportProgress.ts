/**
 * W077 — vault export progress (indeterminate prepare → share → ready / error retry).
 */

export type ExportProgressPhase = 'idle' | 'preparing' | 'sharing' | 'ready' | 'error';

export type ExportProgressEvent =
  | { type: 'start' }
  | { type: 'fetched' }
  | { type: 'shared'; shared: boolean; uri: string }
  | { type: 'fail'; message: string }
  | { type: 'reset' };

export type ExportProgressState = {
  phase: ExportProgressPhase;
  message: string | null;
  uri: string | null;
  shared: boolean;
};

export const INITIAL_EXPORT_PROGRESS: ExportProgressState = {
  phase: 'idle',
  message: null,
  uri: null,
  shared: false,
};

export function reduceExportProgress(
  state: ExportProgressState,
  event: ExportProgressEvent,
): ExportProgressState {
  switch (event.type) {
    case 'start':
      return {
        phase: 'preparing',
        message: 'Preparing your export…',
        uri: null,
        shared: false,
      };
    case 'fetched':
      return {
        ...state,
        phase: 'sharing',
        message: 'Opening share sheet…',
      };
    case 'shared':
      return {
        phase: 'ready',
        message: event.shared
          ? 'Ready — save or send your export from the share sheet.'
          : `Saved locally at ${event.uri}`,
        uri: event.uri,
        shared: event.shared,
      };
    case 'fail':
      return {
        phase: 'error',
        message: event.message,
        uri: null,
        shared: false,
      };
    case 'reset':
      return INITIAL_EXPORT_PROGRESS;
    default:
      return state;
  }
}

export function exportProgressLabel(phase: ExportProgressPhase): string {
  switch (phase) {
    case 'preparing':
      return 'Preparing…';
    case 'sharing':
      return 'Sharing…';
    case 'ready':
      return 'Export ready';
    case 'error':
      return 'Export failed';
    default:
      return 'Export my data';
  }
}

export function exportShowsIndeterminate(phase: ExportProgressPhase): boolean {
  return phase === 'preparing' || phase === 'sharing';
}

export function exportCanRetry(phase: ExportProgressPhase): boolean {
  return phase === 'error';
}
