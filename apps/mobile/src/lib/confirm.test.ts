import { Alert, Platform, type AlertButton } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { confirmAsync, notify } from './confirm';

const realOS = Platform.OS;

afterEach(() => {
  (Platform as { OS: string }).OS = realOS;
  vi.mocked(Alert.alert).mockReset();
  vi.restoreAllMocks();
});

function pressNative(label: string) {
  vi.mocked(Alert.alert).mockImplementationOnce((_t, _m, buttons?: AlertButton[]) => {
    buttons?.find((b) => b.text === label)?.onPress?.();
  });
}

describe('confirmAsync on native', () => {
  it('shows Alert.alert with cancel first, and resolves with the button pressed', async () => {
    pressNative('Delete');
    await expect(
      confirmAsync('Delete?', 'Gone for good.', { confirmLabel: 'Delete', destructive: true }),
    ).resolves.toBe(true);
    const [title, message, buttons] = vi.mocked(Alert.alert).mock.calls[0]!;
    expect([title, message]).toEqual(['Delete?', 'Gone for good.']);
    expect(buttons?.map((b) => [b.text, b.style])).toEqual([
      ['Cancel', 'cancel'],
      ['Delete', 'destructive'],
    ]);

    pressNative('Not now');
    await expect(
      confirmAsync('Rush?', 'Spend coins.', { confirmLabel: 'Rush it', cancelLabel: 'Not now' }),
    ).resolves.toBe(false);
    // A plain confirm has no style, as before.
    expect(vi.mocked(Alert.alert).mock.calls[1]![2]![1]!.style).toBeUndefined();
  });

  it('notifies with Alert.alert', () => {
    notify('Try-on failed', 'No avatar');
    expect(Alert.alert).toHaveBeenCalledWith('Try-on failed', 'No avatar');
  });
});

describe('on web', () => {
  it('confirms with window.confirm and notifies with window.alert', async () => {
    (Platform as { OS: string }).OS = 'web';
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(true).mockReturnValueOnce(false);
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => undefined);

    await expect(confirmAsync('Rush to Express?', 'Spend 25 coins.')).resolves.toBe(true);
    await expect(confirmAsync('Rush to Express?', 'Spend 25 coins.')).resolves.toBe(false);
    expect(confirm).toHaveBeenCalledWith('Rush to Express?\n\nSpend 25 coins.');

    notify('Unlock failed', 'Not enough coins');
    expect(alert).toHaveBeenCalledWith('Unlock failed\n\nNot enough coins');
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});
