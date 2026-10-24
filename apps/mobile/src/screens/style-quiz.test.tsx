import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import StyleQuizScreen from '@/app/style-quiz';
import { submitStyleQuiz } from '@/src/api/client';
import { useSessionStore } from '@/src/stores/session';

const replace = vi.fn();

vi.mock('expo-router', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace }),
}));

vi.mock('@/src/api/client', () => ({
  getStyleQuiz: vi.fn(async () => ({
    questions: [
      {
        id: 'palette',
        question: 'Which color palette do you reach for?',
        options: [{ id: 'neutrals', label: 'Neutrals', tags: ['neutral'] }],
      },
    ],
  })),
  submitStyleQuiz: vi.fn(async () => ({ saved: true, profileTags: ['neutral'] })),
}));

describe('StyleQuizScreen', () => {
  it('refreshes the feed after saving, so it re-ranks for the new profile', async () => {
    useSessionStore.getState().setSession({ accessToken: 'token-123', refreshToken: 'refresh' });
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    render(
      <QueryClientProvider client={client}>
        <StyleQuizScreen />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByText('Neutrals'));
    fireEvent.click(screen.getByText('Finish'));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/(tabs)/feed'));
    expect(submitStyleQuiz).toHaveBeenCalledWith('token-123', [
      { questionId: 'palette', optionId: 'neutrals' },
    ]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['feed'] });
  });
});
