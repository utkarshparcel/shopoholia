import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { AutotagConfirmDraft } from '@worn/shared';

import { AutotagConfirmSheet } from '@/src/components/AutotagConfirmSheet';

vi.mock('expo-image', () => ({ Image: () => null }));

const draft = (imageUri: string): AutotagConfirmDraft => ({
  imageUri,
  category: 'other',
  colors: [],
  brand: null,
  confidence: 0,
  duplicateWarnings: [],
});

function field(id: string) {
  return screen.getByTestId(id) as HTMLInputElement;
}

describe('AutotagConfirmSheet', () => {
  it('keeps spaces, commas and a cleared category as typed, and saves them cleaned per photo', () => {
    const onConfirm = vi.fn();
    render(
      <AutotagConfirmSheet
        visible
        drafts={[draft('file:///a.jpg'), draft('file:///b.jpg')]}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.change(field('autotag-category'), { target: { value: '' } });
    expect(field('autotag-category').value).toBe('');
    fireEvent.change(field('autotag-category'), { target: { value: 'shoes' } });
    fireEvent.change(field('autotag-colors'), { target: { value: 'tan, ' } });
    expect(field('autotag-colors').value).toBe('tan, ');
    fireEvent.change(field('autotag-colors'), { target: { value: 'tan, cream' } });
    fireEvent.change(field('autotag-brand'), { target: { value: 'Louis ' } });
    expect(field('autotag-brand').value).toBe('Louis ');
    fireEvent.change(field('autotag-brand'), { target: { value: 'Louis Vuitton ' } });

    fireEvent.click(screen.getByText('Next'));
    expect(field('autotag-brand').value).toBe('');
    fireEvent.change(field('autotag-brand'), { target: { value: 'Hidesign' } });
    fireEvent.click(screen.getByText('Prev'));
    expect(field('autotag-brand').value).toBe('Louis Vuitton ');

    fireEvent.click(screen.getByText('Save to closet'));
    const [saved] = onConfirm.mock.calls[0]!;
    expect(saved[0]).toMatchObject({ category: 'shoes', colors: ['tan', 'cream'], brand: 'Louis Vuitton' });
    expect(saved[1]).toMatchObject({ category: 'other', colors: [], brand: 'Hidesign' });
  });
});
