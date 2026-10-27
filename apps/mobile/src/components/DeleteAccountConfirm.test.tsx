import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DeleteAccountConfirm } from './DeleteAccountConfirm';

describe('DeleteAccountConfirm (W078)', () => {
  it('keeps confirm disabled until DELETE is typed', () => {
    const onConfirm = vi.fn();
    render(
      <DeleteAccountConfirm
        visible
        email={null}
        deleting={false}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );
    const confirm = screen.getByRole('button', { name: 'Permanently delete' });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByTestId('delete-confirm-input'), {
      target: { value: 'DELETE' },
    });
    expect(screen.getByRole('button', { name: 'Permanently delete' })).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Permanently delete' }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('accepts email and blocks cancel while deleting', () => {
    const onCancel = vi.fn();
    render(
      <DeleteAccountConfirm
        visible
        email="user@worn.app"
        deleting
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText(/Deleting/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).not.toHaveBeenCalled();
  });
});
