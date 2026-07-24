import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getStyleQuiz, submitStyleQuiz } from '@/src/api/client';
import { Button } from '@/src/components/ui';
import { useSessionStore } from '@/src/stores/session';
import {
  accent,
  accentBg,
  bg,
  fontDisplay,
  fontSansMedium,
  fontSansSemiBold,
  fsBody,
  fsCaption,
  fsDisplayL,
  radiusLg,
  space2,
  space3,
  space4,
  space6,
  surface,
  text,
  textMuted,
  wornInk,
} from '@/src/theme/tokens';

type Question = {
  id: string;
  question: string;
  options: Array<{ id: string; label: string; tags?: string[] }>;
};

export default function StyleQuizScreen() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!accessToken) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    getStyleQuiz(accessToken)
      .then((data) => {
        if (cancelled) return;
        setQuestions(data.questions);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load quiz');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  if (loading) {
    return (
      <View style={[styles.center, styles.container, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={wornInk} />
      </View>
    );
  }

  if (error || questions.length === 0) {
    return (
      <View
        style={[
          styles.container,
          styles.emptyContainer,
          {
            paddingBottom: insets.bottom + space6,
            paddingTop: insets.top + space4,
          },
        ]}
      >
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Could not load quiz</Text>
          <Text style={styles.emptyBody}>
            {error ?? 'No questions available right now. Try again later.'}
          </Text>
        </View>
      </View>
    );
  }

  const question = questions[currentIdx];
  const isLast = currentIdx === questions.length - 1;
  const progress = ((currentIdx + 1) / questions.length) * 100;

  const selectOption = (optionId: string) => {
    setAnswers((prev) => ({ ...prev, [question.id]: optionId }));
  };

  const handleNext = async () => {
    if (isLast) {
      if (!accessToken) return;
      setSubmitting(true);
      try {
        const answerArray = Object.entries(answers).map(([questionId, optionId]) => ({
          questionId,
          optionId,
        }));
        await submitStyleQuiz(accessToken, answerArray);
        router.replace('/(tabs)/feed');
      } finally {
        setSubmitting(false);
      }
    } else {
      setCurrentIdx((i) => i + 1);
    }
  };

  const canProceed = answers[question?.id] !== undefined;

  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom: insets.bottom,
          paddingTop: insets.top,
        },
      ]}
    >
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>

      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.stepLabel}>
          Question {currentIdx + 1} of {questions.length}
        </Text>
        <Text style={styles.question}>{question?.question}</Text>

        <View style={styles.options}>
          {question?.options.map((option) => {
            const selected = answers[question.id] === option.id;
            return (
              <Pressable
                key={option.id}
                style={[styles.optionCard, selected && styles.optionSelected]}
                onPress={() => selectOption(option.id)}
              >
                <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {currentIdx > 0 ? (
          <Button
            label="Back"
            variant="ghost"
            size="md"
            onPress={() => setCurrentIdx((i) => i - 1)}
          />
        ) : (
          <View />
        )}
        <Button
          label={isLast ? (submitting ? 'Saving…' : 'Finish') : 'Next'}
          variant="primary"
          size="md"
          onPress={handleNext}
          disabled={!canProceed || submitting}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  back: {
    marginBottom: space2,
    paddingHorizontal: space4,
  },
  backText: {
    color: textMuted,
    fontFamily: fontSansMedium,
    fontSize: fsBody,
  },
  center: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  container: {
    backgroundColor: bg,
    flex: 1,
  },
  emptyBody: {
    color: textMuted,
    fontFamily: fontSansMedium,
    fontSize: fsBody,
    marginTop: space2,
    textAlign: 'center',
  },
  emptyContainer: {
    paddingHorizontal: space4,
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: surface,
    borderRadius: radiusLg,
    flex: 1,
    justifyContent: 'center',
    padding: space6,
  },
  emptyTitle: {
    color: text,
    fontFamily: fontDisplay,
    fontSize: fsDisplayL,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space4,
    paddingVertical: space3,
  },
  optionCard: {
    backgroundColor: surface,
    borderColor: 'transparent',
    borderRadius: radiusLg,
    borderWidth: 2,
    marginBottom: space3,
    padding: space4,
  },
  optionSelected: {
    backgroundColor: accentBg,
    borderColor: accent,
  },
  optionText: {
    color: text,
    fontFamily: fontSansMedium,
    fontSize: fsBody,
  },
  optionTextSelected: {
    color: accent,
    fontFamily: fontSansSemiBold,
  },
  options: {
    marginTop: space4,
  },
  progressBar: {
    backgroundColor: surface,
    height: 4,
    width: '100%',
  },
  progressFill: {
    backgroundColor: accent,
    height: '100%',
  },
  question: {
    color: text,
    fontFamily: fontDisplay,
    fontSize: fsDisplayL,
    marginTop: space2,
  },
  scroll: {
    flexGrow: 1,
    padding: space4,
  },
  stepLabel: {
    color: textMuted,
    fontFamily: fontSansMedium,
    fontSize: fsCaption,
    marginTop: space4,
  },
});
