import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { AutotagConfirmSheet } from '@/src/components/AutotagConfirmSheet';
import { SurfaceEduSheet } from '@/src/components/SurfaceEduSheet';
import { TrackBuySuccessSheet } from '@/src/components/TrackBuySuccessSheet';

vi.mock('expo-image', () => ({ Image: () => null }));

/** Pressable renders a <button> (as role="button" does on web): a button inside a button is invalid. */
function nestedButtons(container: HTMLElement) {
  return container.querySelectorAll('button button').length;
}

describe('modal sheets dismiss from a sibling backdrop', () => {
  it('SurfaceEduSheet: no nested buttons; each action fires once and only its own handler', () => {
    const onContinue = vi.fn();
    const onSkip = vi.fn();
    const { container } = render(
      <SurfaceEduSheet visible onContinue={onContinue} onSkip={onSkip} />,
    );
    expect(nestedButtons(container)).toBe(0);

    fireEvent.click(screen.getByText('Got it'));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onSkip).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('Close'));
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('SurfaceEduSheet renders nothing while hidden', () => {
    const { container } = render(
      <SurfaceEduSheet visible={false} onContinue={vi.fn()} onSkip={vi.fn()} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('TrackBuySuccessSheet: no nested buttons; the backdrop closes', () => {
    const onClose = vi.fn();
    const onOpenVault = vi.fn();
    const { container } = render(
      <TrackBuySuccessSheet
        visible
        created
        onClose={onClose}
        onOpenVault={onOpenVault}
        onOpenWardrobe={vi.fn()}
      />,
    );
    expect(nestedButtons(container)).toBe(0);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onOpenVault).not.toHaveBeenCalled();
  });

  it('AutotagConfirmSheet: no nested buttons; the backdrop cancels without confirming', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const { container } = render(
      <AutotagConfirmSheet visible drafts={[]} onCancel={onCancel} onConfirm={onConfirm} />,
    );
    expect(nestedButtons(container)).toBe(0);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
