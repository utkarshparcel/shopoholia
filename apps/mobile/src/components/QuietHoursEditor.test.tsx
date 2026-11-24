import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { QuietHoursEditor } from './QuietHoursEditor';

describe('QuietHoursEditor (W082)', () => {
  it('renders start/end and next-send preview', () => {
    const now = new Date('2026-08-26T23:00:00.000Z');
    render(
      <QuietHoursEditor
        quietHoursStart="22:00"
        quietHoursEnd="07:00"
        now={now}
        timeZone="UTC"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('quiet-hours-start').textContent).toBe('22:00');
    expect(screen.getByTestId('quiet-hours-end').textContent).toBe('07:00');
    expect(screen.getByTestId('quiet-hours-preview').textContent).toMatch(
      /Next send at/,
    );
  });

  it('nudges start with +/− pickers', () => {
    const onChange = vi.fn();
    render(
      <QuietHoursEditor
        quietHoursStart="22:00"
        quietHoursEnd="07:00"
        onChange={onChange}
      />,
    );
    const plusButtons = screen.getAllByRole('button', { name: '+' });
    fireEvent.click(plusButtons[0]!);
    expect(onChange).toHaveBeenCalledWith('22:30', '07:00');
  });

  it('S3-25 / S3-27: says the times are local, never UTC', () => {
    render(
      <QuietHoursEditor
        quietHoursStart="22:00"
        quietHoursEnd="07:00"
        timeZone="Asia/Kolkata"
        onChange={vi.fn()}
      />,
    );
    const hint = screen.getByTestId('quiet-hours-hint').textContent ?? '';
    expect(hint).toContain('your local time (Asia/Kolkata)');
    expect(screen.getByTestId('quiet-hours-editor').textContent).not.toMatch(/UTC|HH:mm/);
  });
});
