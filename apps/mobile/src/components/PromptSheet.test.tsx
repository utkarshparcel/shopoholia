import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { PromptSheet, usePrompt, type PromptOptions, type PromptValues } from '@/src/components/PromptSheet';

const lend: PromptOptions = {
  title: 'Lend to',
  fields: [
    { key: 'name', label: 'Who borrowed it?' },
    { key: 'dueOn', label: 'Due back', defaultValue: '2026-11-03' },
  ],
  confirmLabel: 'Lend',
  validate: (v) => (v.name ? null : 'Enter a name.'),
};

describe('PromptSheet', () => {
  it('renders nothing without a request', () => {
    const { container } = render(<PromptSheet request={null} onResolve={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows defaults, blocks invalid input inline, then resolves trimmed values', () => {
    const onResolve = vi.fn();
    const { container } = render(<PromptSheet request={lend} onResolve={onResolve} />);
    expect(container.querySelectorAll('button button').length).toBe(0);
    expect((screen.getByTestId('prompt-field-dueOn') as HTMLInputElement).value).toBe('2026-11-03');

    fireEvent.click(screen.getByText('Lend'));
    expect(screen.getByTestId('prompt-error').textContent).toBe('Enter a name.');
    expect(onResolve).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId('prompt-field-name'), { target: { value: '  Asha ' } });
    expect(screen.queryByTestId('prompt-error')).toBeNull();
    fireEvent.click(screen.getByText('Lend'));
    expect(onResolve).toHaveBeenCalledWith({ name: 'Asha', dueOn: '2026-11-03' });
  });

  it('Cancel and the backdrop resolve null', () => {
    const onResolve = vi.fn();
    render(<PromptSheet request={lend} onResolve={onResolve} />);
    fireEvent.click(screen.getByText('Cancel'));
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onResolve.mock.calls).toEqual([[null], [null]]);
  });
});

describe('usePrompt', () => {
  function Harness({ onAsk }: { onAsk: (p: Promise<PromptValues | null>) => void }) {
    const { ask, promptElement } = usePrompt();
    return (
      <>
        <button type="button" onClick={() => onAsk(ask(lend))}>
          open
        </button>
        {promptElement}
      </>
    );
  }

  it('ask() resolves with the values, then the sheet closes', async () => {
    let pending: Promise<PromptValues | null> | null = null;
    render(<Harness onAsk={(p) => (pending = p)} />);
    fireEvent.click(screen.getByText('open'));
    fireEvent.change(screen.getByTestId('prompt-field-name'), { target: { value: 'Ravi' } });
    fireEvent.click(screen.getByText('Lend'));
    await expect(pending).resolves.toEqual({ name: 'Ravi', dueOn: '2026-11-03' });
    expect(screen.queryByTestId('prompt-sheet')).toBeNull();
  });

  it('a second ask settles the first with null and starts from its own defaults', async () => {
    const asks: Promise<PromptValues | null>[] = [];
    render(<Harness onAsk={(p) => asks.push(p)} />);
    fireEvent.click(screen.getByText('open'));
    fireEvent.change(screen.getByTestId('prompt-field-name'), { target: { value: 'typed' } });
    fireEvent.click(screen.getByText('open'));
    await expect(asks[0]).resolves.toBeNull();
    expect((screen.getByTestId('prompt-field-name') as HTMLInputElement).value).toBe('');
  });

  it('unmounting settles an open ask with null', async () => {
    let pending: Promise<PromptValues | null> | null = null;
    const { unmount } = render(<Harness onAsk={(p) => (pending = p)} />);
    fireEvent.click(screen.getByText('open'));
    act(() => unmount());
    await expect(pending).resolves.toBeNull();
  });
});
