import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Alert } from 'react-native';
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

describe('StyleQuizScreen: a failed save', () => {
  it('says the quiz could not be saved, keeps the answers, and saves on the next Finish', async () => {
    useSessionStore.getState().setSession({ accessToken: 'token-123', refreshToken: 'refresh' });
    replace.mockClear();
    vi.mocked(Alert.alert).mockClear();
    vi.mocked(submitStyleQuiz).mockClear().mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(
      <QueryClientProvider client={new QueryClient()}>
        <StyleQuizScreen />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByText('Neutrals'));
    fireEvent.click(screen.getByText('Finish'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Couldn’t save your quiz',
        'Could not reach WORN. Check your connection and try again.',
      ),
    );
    expect(replace).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByText('Finish'));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/(tabs)/feed'));
    expect(vi.mocked(submitStyleQuiz).mock.calls[1]?.[1]).toEqual([
      { questionId: 'palette', optionId: 'neutrals' },
    ]);
  });
});
