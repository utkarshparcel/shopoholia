import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SectionHeader } from './SectionHeader';

describe('SectionHeader', () => {
  it('renders kicker and title', () => {
    render(<SectionHeader kicker="Feed" title="For you" />);
    expect(screen.getByText('Feed')).toBeTruthy();
    expect(screen.getByText('For you')).toBeTruthy();
  });
});
