import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  Animated,
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Button } from '@/src/components/ui';
import { AvatarOutfitReveal } from '@/src/components/AvatarOutfitReveal';
import { ClosetScreen } from '@/src/components/ClosetScreen';
import {
  useCapsule,
  useGenerateWeekOutfit,
  useLogWear,
  useOutfitAlternative,
  useOutfitsFromCalendar,
  usePackages,
  usePatchInterviewKit,
  usePatchWeekOutfit,
  useRewearStreak,
  useSaveInterviewKit,
  useSelectTodayOutfit,
  useTodayOutfit,
  useTravelPack,
  useUpdateWardrobeItem,
  useWardrobe,
  useWeddingFestivalPlan,
  useWeekOutfits,
  useWorkwearRotation,
} from '@/src/hooks/closet/useCloset';
import { createAskFriendPoll, type WardrobeItem } from '@/src/api/client';
import { PremiumGate } from '@/src/components/PremiumGate';
import { CompleteLookSheet } from '@/src/components/CompleteLookSheet';
import { GoesWithSheet } from '@/src/components/GoesWithSheet';
import { PriceDropAlertCards } from '@/src/components/PriceDropAlertCards';
import { AccessorySlotToday } from '@/src/components/AccessorySlotToday';
import { RewearStreakCelebrate } from '@/src/components/RewearStreakCelebrate';
import { buildDryCleanHomeTile, getCopyPack } from '@worn/shared';
import { FEATURE_CLOSET } from '@/src/lib/features';
import {
  beginClosetColdStart,
  markClosetInteractive,
  useClosetSecondaryReady,
} from '@/src/lib/closetColdStart';
import {
  isCalendarPermissionGranted,
  requestCalendarPermission,
} from '@/src/lib/calendarPermission';
import { listUpcomingCalendarEvents } from '@/src/lib/deviceCalendar';
import { delightHapticWoreIt } from '@/src/lib/delightHaptics';
import { askFriendOptionsFromLooks } from '@/src/lib/socialPolls';
import { trackEvent } from '@/src/lib/analytics';
import { emptyCtaTapProps, emptyStateCopy } from '@/src/lib/emptyDemo';
import { useClosetPrefsStore } from '@/src/lib/closetPrefs';
import { useSessionStore } from '@/src/stores/session';
import {
  defaultWeddingSpan,
  interviewKitRemindConfirm,
  parseDateKey,
  parseInterviewEventAt,
  wearPhotoErrorCopy,
  weddingFestivalDayCount,
  weddingFestivalPlanSummary,
  withCapsulePreference,
  workwearDayBadge,
  workwearRegenerateBody,
  workwearStripDays,
} from '@/src/lib/todayOccasionWow';
import {
  altSwipeOffset,
  avoidRepeatChips,
  calendarImportSuccessCopy,
  dirtyWardrobeItemIds,
  isMorningOutfitDeepLink,
  laundryStarvationPrompt,
  mergeGoesWithIntoOutfit,
  nextAltIndex,
  shouldAnimateAltSwipe,
  weatherRerollBannerCopy,
  weekDayAssignPayload,
  weekStripPlanHint,
} from '@/src/lib/todayWow';
import {
  closet,
  fontSans,
  fsBody,
  fsCaption,
  radiusMd,
  space3,
  space4,
} from '@/src/theme/tokens';

export default function ClosetTodayScreen() {
  const params = useLocalSearchParams<{ focus?: string; reveal?: string; url?: string }>();
  const secondaryReady = useClosetSecondaryReady();
  const { data, isLoading, isError, error, refetch } = useTodayOutfit();
  const wardrobe = useWardrobe(undefined, { enabled: secondaryReady });
  const week = useWeekOutfits();
  const [showCompleteLook, setShowCompleteLook] = useState(false);
  const [showAvatarReveal, setShowAvatarReveal] = useState(false);
  const [goesAnchor, setGoesAnchor] = useState<Pick<WardrobeItem, 'id' | 'category' | 'brand'> | null>(
    null,
  );
  const [laundryDismissed, setLaundryDismissed] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const altSlideX = useRef(new Animated.Value(0)).current;
  const dryCleanTile = buildDryCleanHomeTile(wardrobe.data?.items ?? []);
  const generateWeek = useGenerateWeekOutfit();
  const travelPack = useTravelPack();
  const workwear = useWorkwearRotation();
  const fromCalendar = useOutfitsFromCalendar();
  const weddingFestival = useWeddingFestivalPlan();
  const interviewKit = useSaveInterviewKit();
  const patchInterview = usePatchInterviewKit();
  const patchWeek = usePatchWeekOutfit();
  const updateWardrobe = useUpdateWardrobeItem();
  const capsule = useCapsule({ enabled: secondaryReady });
  const altFetch = useOutfitAlternative();
  const selectOutfit = useSelectTodayOutfit();
  const wear = useLogWear();
  const packages = usePackages(false, { enabled: secondaryReady });
  const rewear = useRewearStreak({ enabled: secondaryReady });
  const router = useRouter();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [altIndex, setAltIndex] = useState(0);
  const [altOutfit, setAltOutfit] = useState<
    NonNullable<typeof data>['outfit'] | null
  >(null);
  const [altHasMore, setAltHasMore] = useState<boolean | null>(null);
  const preferCapsuleToday = useClosetPrefsStore((s) => s.preferCapsuleToday);
  const setPreferCapsuleToday = useClosetPrefsStore((s) => s.setPreferCapsuleToday);
  const hasMoreAlts = altIndex === 0 ? Boolean(data?.hasMore) : Boolean(altHasMore);

  useEffect(() => {
    beginClosetColdStart();
  }, []);

  useEffect(() => {
    if (isLoading || week.isLoading) return;
    markClosetInteractive('today');
  }, [isLoading, week.isLoading]);

  const todayOutfit = altOutfit ?? data?.outfit ?? null;
  const days = week.data?.days ?? [];
  const selectedDay = useMemo(() => {
    if (!days.length) return null;
    if (selectedDate) return days.find((d) => d.date === selectedDate) ?? null;
    return days.find((d) => d.isToday) ?? null;
  }, [days, selectedDate]);

  const outfit = (!selectedDay || selectedDay.isToday) ? todayOutfit : selectedDay?.outfit;
  const whyThis = (outfit as { whyThis?: string[] } | null)?.whyThis ?? [];
  const avoidChips = avoidRepeatChips(whyThis);
  const viewingToday = !selectedDay || selectedDay.isToday;
  const loading = isLoading || week.isLoading;
  const empty = !loading && !isError && !outfit && days.every((d) => !d.outfit);
  const emptyCopyVariant = useClosetPrefsStore((s) => s.emptyCopyVariant);
  const copyPackId = useClosetPrefsStore((s) => s.copyPackId);
  const copyPack = getCopyPack(copyPackId);
  const todayEmpty = emptyStateCopy('today', emptyCopyVariant, copyPackId);
  const workStrip = workwearStripDays(days);
  const hasCapsule = (capsule.data?.itemIds?.length ?? 0) > 0;
  const laundryPrompt = laundryStarvationPrompt(wardrobe.data?.items ?? []);
  const weatherCopy = weatherRerollBannerCopy();
  const plannedForDate =
    (outfit as { plannedFor?: string | null } | null)?.plannedFor ??
    selectedDay?.date ??
    new Date().toISOString().slice(0, 10);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (alive) setReduceMotion(Boolean(enabled));
    });
    const sub = AccessibilityInfo.addEventListener?.(
      'reduceMotionChanged',
      (enabled: boolean) => setReduceMotion(Boolean(enabled)),
    );
    return () => {
      alive = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sub as any)?.remove?.();
    };
  }, []);

  /** W043 — worn://today?focus=outfit → focus today + short avatar reveal. */
  useEffect(() => {
    const focus = Array.isArray(params.focus) ? params.focus[0] : params.focus;
    const reveal = Array.isArray(params.reveal) ? params.reveal[0] : params.reveal;
    const url = Array.isArray(params.url) ? params.url[0] : params.url;
    if (!isMorningOutfitDeepLink({ focus, reveal, url })) return;
    setSelectedDate(null);
    setShowAvatarReveal(true);
    trackEvent('outfit_morning_reveal' as never, { focus: focus ?? 'today' });
  }, [params.focus, params.reveal, params.url]);

  function capsuleBody<T extends { date?: string; fillWeek?: boolean }>(body: T) {
    return withCapsulePreference(body, preferCapsuleToday);
  }

  /** W051 — camera → attach → wear in ≤3 taps; gallery fallback; recoverable errors. */
  async function snapWearPhoto(opts?: { autoLog?: boolean }) {
    try {
      const cam = await ImagePicker.requestCameraPermissionsAsync();
      const result =
        cam.status === 'granted'
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.8,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.8,
            });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      const uri = result.assets[0].uri;
      setPhotoUri(uri);
      trackEvent('wear_photo_snapped' as never, { source: cam.status === 'granted' ? 'camera' : 'library' });
      if (opts?.autoLog && outfit) {
        wear.mutate(
          { outfitId: outfit.id, photoUri: uri },
          {
            onSuccess: () => {
              void delightHapticWoreIt();
              setPhotoUri(null);
              Alert.alert('Logged', 'Wear logged with photo.');
            },
            onError: (e) => {
              const copy = wearPhotoErrorCopy((e as Error).message);
              Alert.alert(copy.title, copy.body, [
                { text: 'OK', style: 'cancel' },
                {
                  text: copy.retryLabel,
                  onPress: () =>
                    wear.mutate(
                      { outfitId: outfit.id, photoUri: uri },
                      {
                        onSuccess: () => {
                          void delightHapticWoreIt();
                          setPhotoUri(null);
                          Alert.alert('Logged', 'Wear logged with photo.');
                        },
                        onError: (err) =>
                          Alert.alert(copy.title, wearPhotoErrorCopy((err as Error).message).body),
                      },
                    ),
                },
              ]);
            },
          },
        );
      }
    } catch (e) {
      const copy = wearPhotoErrorCopy((e as Error).message);
      Alert.alert(copy.title, copy.body);
    }
  }

  function logWoreIt() {
    if (!outfit) return;
    wear.mutate(
      { outfitId: outfit.id, photoUri },
      {
        onSuccess: () => {
          void delightHapticWoreIt();
          setPhotoUri(null);
          Alert.alert('Logged', photoUri ? 'Wear logged with photo.' : 'Wear logged.');
        },
        onError: (e) => {
          const copy = wearPhotoErrorCopy((e as Error).message);
          Alert.alert(copy.title, copy.body, [
            { text: 'OK', style: 'cancel' },
            { text: copy.retryLabel, onPress: logWoreIt },
          ]);
        },
      },
    );
  }

  function regenerateDay() {
    const date = selectedDay?.date;
    generateWeek.mutate(
      capsuleBody(date ? { date } : { fillWeek: true }),
      {
        onSuccess: () => {
          setAltIndex(0);
          setAltOutfit(null);
          void refetch();
          void week.refetch();
        },
        onError: (e) => Alert.alert('Could not regenerate', (e as Error).message),
      },
    );
  }

  function runAltSwipeMotion(delta: 1 | -1, then: () => void) {
    if (!shouldAnimateAltSwipe(reduceMotion)) {
      then();
      return;
    }
    altSlideX.setValue(altSwipeOffset(delta));
    Animated.timing(altSlideX, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => then());
  }

  /** W044 — Prev/Next with clamped index + Reduce Motion–safe slide. */
  function swipeAlt(delta: 1 | -1) {
    const next = nextAltIndex(altIndex, delta, { hasMore: hasMoreAlts });
    if (next === null) return;

    const apply = () => {
      if (next === 0) {
        setAltIndex(0);
        setAltOutfit(null);
        setAltHasMore(null);
        return;
      }
      altFetch.mutate(next, {
        onSuccess: (res) => {
          if (!res.outfit) {
            Alert.alert('No more looks', 'That’s the last alternative for today.');
            setAltHasMore(false);
            return;
          }
          setAltIndex(res.altIndex ?? next);
          setAltOutfit(res.outfit);
          setAltHasMore(Boolean(res.hasMore));
        },
        onError: (e) => Alert.alert('Could not load alternative', (e as Error).message),
      });
    };
    runAltSwipeMotion(delta, apply);
  }

  function commitAlt() {
    if (!outfit || altIndex === 0) return;
    selectOutfit.mutate(
      { outfitId: outfit.id, alt: altIndex },
      {
        onSuccess: () => {
          setAltIndex(0);
          setAltOutfit(null);
          void refetch();
          void week.refetch();
          Alert.alert('Saved', 'This look is your outfit for today.');
        },
        onError: (e) => Alert.alert('Could not save look', (e as Error).message),
      },
    );
  }

  /** W045 — accept weather-rerolled look as today’s committed outfit. */
  function acceptWeatherReroll() {
    if (!outfit) return;
    selectOutfit.mutate(
      { outfitId: outfit.id, alt: altIndex },
      {
        onSuccess: () => {
          setAltIndex(0);
          setAltOutfit(null);
          void refetch();
          void week.refetch();
          Alert.alert(weatherCopy.cta, 'Weather-updated look is set for today.');
        },
        onError: (e) => Alert.alert('Could not save look', (e as Error).message),
      },
    );
  }

  /** W046 — long-press week day assigns the viewing look via PATCH. */
  function assignLookToDay(date: string) {
    if (!outfit?.itemIds?.length) {
      Alert.alert('No look to assign', 'Generate a look first, then long-press a day.');
      return;
    }
    const body = weekDayAssignPayload(date, {
      itemIds: outfit.itemIds as string[],
      occasion: outfit.occasion,
    });
    patchWeek.mutate(body, {
      onSuccess: () => {
        setSelectedDate(date);
        void week.refetch();
        void refetch();
        Alert.alert('Planned', `Look assigned to ${date}.`);
      },
      onError: (e) => Alert.alert('Could not plan day', (e as Error).message),
    });
  }

  /** W050 — bulk mark dirty/in-laundry pieces clean, then regenerate. */
  async function markLaundryClean() {
    const ids = dirtyWardrobeItemIds(wardrobe.data?.items ?? []);
    try {
      await Promise.all(
        ids.map((id) => updateWardrobe.mutateAsync({ id, patch: { laundryStatus: 'CLEAN' } })),
      );
      setLaundryDismissed(true);
      regenerateDay();
    } catch (e) {
      Alert.alert('Could not mark clean', (e as Error).message);
    }
  }

  function wearAnywayFromLaundry() {
    setLaundryDismissed(true);
    regenerateDay();
  }

  function tryGoesWithOnToday(match: WardrobeItem & { score: number; slot: string; reasons: string[] }) {
    if (!goesAnchor || !outfit?.itemIds) return;
    const nextIds = mergeGoesWithIntoOutfit(
      outfit.itemIds as string[],
      goesAnchor.id,
      match.id,
    );
    patchWeek.mutate(
      { date: plannedForDate, itemIds: nextIds, occasion: outfit.occasion },
      {
        onSuccess: () => {
          setGoesAnchor(null);
          void refetch();
          void week.refetch();
          trackEvent('wardrobe_goes_with' as never, { matchId: match.id });
        },
        onError: (e) => Alert.alert('Could not try on', (e as Error).message),
      },
    );
  }

  function confirmInterviewKit(kit: {
    id: string;
    remindAt: string | null;
    eventAt: string;
    reminderScheduled: boolean;
  }) {
    const confirm = interviewKitRemindConfirm(kit);
    const buttons: Array<{
      text: string;
      style?: 'cancel' | 'destructive' | 'default';
      onPress?: () => void;
    }> = [{ text: 'Keep', style: 'cancel' }];
    if (confirm.canEdit) {
      buttons.push({
        text: 'Edit date',
        onPress: () => {
          const apply = (raw?: string) => {
            const next = parseInterviewEventAt(raw ?? '', kit.eventAt);
            if (!next) {
              Alert.alert('Invalid date', 'Use YYYY-MM-DD or an ISO datetime.');
              return;
            }
            patchInterview.mutate(
              { id: kit.id, eventAt: next, remindNightBefore: true },
              {
                onSuccess: (res) =>
                  Alert.alert(
                    'Updated',
                    res.kit.remindAt
                      ? `Reminder moved to ${new Date(res.kit.remindAt).toLocaleString()}.`
                      : 'Event updated — reminder window passed.',
                  ),
                onError: (e) => Alert.alert('Could not edit', (e as Error).message),
              },
            );
          };
          if (typeof Alert.prompt === 'function') {
            Alert.prompt(
              'Event date',
              'YYYY-MM-DD',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Save', onPress: apply },
              ],
              'plain-text',
              kit.eventAt.slice(0, 10),
            );
          } else {
            apply(kit.eventAt.slice(0, 10));
          }
        },
      });
    }
    if (confirm.canCancel) {
      buttons.push({
        text: 'Cancel reminder',
        style: 'destructive',
        onPress: () =>
          patchInterview.mutate(
            { id: kit.id, cancelReminder: true },
            {
              onSuccess: () => Alert.alert('Reminder canceled', 'Kit stays saved without a nudge.'),
              onError: (e) => Alert.alert('Could not cancel', (e as Error).message),
            },
          ),
      });
    }
    Alert.alert(confirm.title, confirm.body, buttons);
  }

  function runWeddingPlanner() {
    const defaults = defaultWeddingSpan();
    const run = (startDate: string, endDate: string, kind: 'wedding' | 'festival', budget?: number) => {
      const daysN = weddingFestivalDayCount(startDate, endDate);
      if (daysN < 1) {
        Alert.alert('Invalid dates', 'End date must be on or after start date (YYYY-MM-DD).');
        return;
      }
      weddingFestival.mutate(
        {
          startDate,
          endDate,
          kind,
          label: kind === 'wedding' ? 'Upcoming wedding' : 'Festival week',
          budgetLimitMinor: budget,
          plannedSpendMinor: 0,
          commit: true,
        },
        {
          onSuccess: (plan) => {
            void week.refetch();
            Alert.alert('Planner ready', weddingFestivalPlanSummary(plan));
          },
          onError: (e) =>
            Alert.alert('Could not plan wedding/festival', (e as Error).message),
        },
      );
    };

    const afterKind = (kind: 'wedding' | 'festival') => {
      const askBudget = (startDate: string, endDate: string) => {
        if (typeof Alert.prompt === 'function') {
          Alert.prompt(
            'Spend envelope (optional)',
            'Budget in ₹ (blank = skip)',
            [
              {
                text: 'Skip',
                style: 'cancel',
                onPress: () => run(startDate, endDate, kind),
              },
              {
                text: 'Plan',
                onPress: (raw?: string) => {
                  const n = Number(raw);
                  const budget =
                    Number.isFinite(n) && n > 0 ? Math.round(n * 100) : undefined;
                  run(startDate, endDate, kind, budget);
                },
              },
            ],
            'plain-text',
            '',
          );
        } else {
          run(startDate, endDate, kind, 50_000_00);
        }
      };

      if (typeof Alert.prompt === 'function') {
        Alert.prompt(
          'Start date',
          'YYYY-MM-DD',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Next',
              onPress: (startRaw?: string) => {
                const startDate = parseDateKey(startRaw ?? '') ?? defaults.startDate;
                Alert.prompt?.(
                  'End date',
                  'YYYY-MM-DD',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Next',
                      onPress: (endRaw?: string) => {
                        const endDate = parseDateKey(endRaw ?? '') ?? defaults.endDate;
                        askBudget(startDate, endDate);
                      },
                    },
                  ],
                  'plain-text',
                  defaults.endDate,
                );
              },
            },
          ],
          'plain-text',
          defaults.startDate,
        );
      } else {
        askBudget(defaults.startDate, defaults.endDate);
      }
    };

    Alert.alert('Wedding / festival', 'Plan multi-day outfits from your closet.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Wedding', onPress: () => afterKind('wedding') },
      { text: 'Festival', onPress: () => afterKind('festival') },
    ]);
  }

  async function askFriendWhichLook() {
    const token = useSessionStore.getState().accessToken;
    if (!token) {
      Alert.alert('Sign in', 'Sign in to ask a friend which look to wear.');
      return;
    }
    const primary = data?.outfit;
    if (!primary?.itemIds?.length) {
      Alert.alert('No looks yet', 'Generate today’s outfit first, then swipe for alts.');
      return;
    }
    const looks = [
      {
        id: primary.id,
        itemIds: primary.itemIds as string[],
        categories: (primary.items ?? []).map((it) => it.category),
        occasion: primary.occasion,
      },
    ];
    if (altOutfit?.itemIds?.length && altIndex > 0) {
      looks.push({
        id: altOutfit.id,
        itemIds: altOutfit.itemIds as string[],
        categories: (altOutfit.items ?? []).map((it) => it.category),
        occasion: altOutfit.occasion,
      });
    } else if (hasMoreAlts) {
      try {
        const res = await new Promise<NonNullable<typeof data>>((resolve, reject) => {
          altFetch.mutate(1, {
            onSuccess: (r) => resolve(r as NonNullable<typeof data>),
            onError: reject,
          });
        });
        if (res.outfit?.itemIds?.length) {
          looks.push({
            id: res.outfit.id,
            itemIds: res.outfit.itemIds as string[],
            categories: (res.outfit.items ?? []).map((it) => it.category),
            occasion: res.outfit.occasion,
          });
        }
      } catch {
        // fall through with primary only — need ≥2
      }
    }
    const options = askFriendOptionsFromLooks(looks).filter((o) => o.itemIds.length > 0);
    if (options.length < 2) {
      Alert.alert('Need alternatives', 'Swipe Next for another look, then ask a friend.');
      return;
    }
    try {
      const poll = await createAskFriendPoll(token, {
        options,
        plannedFor: primary.plannedFor ?? undefined,
      });
      await Share.share({ message: poll.shareText });
      trackEvent('ask_friend_poll_created', {
        pollId: poll.id,
        optionCount: options.length,
      });
    } catch (e) {
      Alert.alert('Could not create poll', (e as Error).message);
    }
  }

  if (!FEATURE_CLOSET) {
    return (
      <ClosetScreen
        title="Today"
        subtitle="Enable EXPO_PUBLIC_FEATURE_CLOSET=1 to see your morning outfit."
      />
    );
  }

  return (
    <ClosetScreen
      title={copyPack.today.title}
      subtitle={copyPack.today.subtitle}
      loading={loading}
      loadingLabel="Building today’s look…"
      error={isError ? ((error as Error)?.message ?? true) : null}
      onRetry={() => {
        void refetch();
        void week.refetch();
      }}
      onRefresh={async () => {
        await Promise.all([refetch(), week.refetch()]);
      }}
      empty={empty}
      emptyTitle={todayEmpty.title}
      emptyMessage={todayEmpty.message}
      emptyAction={
        todayEmpty.primaryCta ? (
          <Button
            label={todayEmpty.primaryCta}
            block
            onPress={() => {
              trackEvent(
                'empty_cta_tap',
                emptyCtaTapProps('today', emptyCopyVariant, 'primary'),
              );
              router.push('/(closet)/wardrobe' as never);
            }}
          />
        ) : null
      }
    >
      <PremiumGate surface="outfits">
      <PriceDropAlertCards />
      {dryCleanTile ? (
        <View style={styles.packageCard} testID="dry-clean-home-tile">
          <Text style={styles.packageTitle}>{dryCleanTile.headline}</Text>
          <Text style={styles.muted}>{dryCleanTile.body}</Text>
          <Button
            label="Open wardrobe"
            size="sm"
            variant="secondary"
            onPress={() => router.push('/(closet)/wardrobe' as never)}
          />
        </View>
      ) : null}
      <View style={styles.packageCard}>
        <Text style={styles.packageTitle}>Complete your look</Text>
        <Text style={styles.muted}>Owned slots plus Closet fills for gaps.</Text>
        <Button
          label="Open complete look"
          size="sm"
          variant="secondary"
          onPress={() => setShowCompleteLook(true)}
        />
      </View>
      <CompleteLookSheet
        visible={showCompleteLook}
        onClose={() => setShowCompleteLook(false)}
        itemIds={outfit?.itemIds}
      />
      {(packages.data?.packages?.length ?? 0) > 0 ? (
        <View style={styles.packageCard}>
          <Text style={styles.packageTitle}>Arriving soon</Text>
          {(packages.data?.packages ?? []).slice(0, 2).map((p) => (
            <Text key={p.id} style={styles.muted}>
              {p.merchant}
              {p.etaAt ? ` · ETA ${new Date(p.etaAt).toLocaleDateString()}` : ''}
              {` · ${p.deliveryStatus.replace(/_/g, ' ')}`}
            </Text>
          ))}
          <Button
            label="Open package tracker"
            size="sm"
            variant="secondary"
            onPress={() => router.push('/(closet)/vault?focus=packages' as never)}
          />
        </View>
      ) : null}

      {rewear.data ? <RewearStreakCelebrate streak={rewear.data} /> : null}

      {hasCapsule ? (
        <View style={styles.capsuleRow}>
          <View style={styles.capsuleCopy}>
            <Text style={styles.packageTitle}>Today from capsule</Text>
            <Text style={styles.muted}>
              {preferCapsuleToday
                ? `Generator stays inside your ${capsule.data?.itemIds.length ?? 0}-item capsule.`
                : 'Using full clean wardrobe.'}
            </Text>
          </View>
          <Switch
            accessibilityLabel="Prefer today from capsule"
            value={preferCapsuleToday}
            onValueChange={(v) => {
              setPreferCapsuleToday(v);
              trackEvent('capsule_today_toggle' as never, { preferCapsule: v });
            }}
          />
        </View>
      ) : null}

      {days.length > 0 ? (
        <View style={styles.weekRow}>
          <Text style={styles.weekLabel}>This week</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weekStrip}>
            {days.map((d) => {
              const active = (selectedDate ?? days.find((x) => x.isToday)?.date) === d.date;
              const workBadge = workwearDayBadge(d.outfit?.occasion);
              return (
                <Pressable
                  key={d.date}
                  onPress={() => setSelectedDate(d.date)}
                  onLongPress={() => assignLookToDay(d.date)}
                  delayLongPress={280}
                  accessibilityHint={weekStripPlanHint()}
                  style={[
                    styles.dayChip,
                    active ? styles.dayChipActive : null,
                    workBadge ? styles.dayChipWork : null,
                  ]}
                >
                  <Text style={[styles.dayWeekday, active ? styles.dayTextActive : null]}>{d.weekday}</Text>
                  <Text style={[styles.dayDate, active ? styles.dayTextActive : null]}>
                    {d.date.slice(8)}
                  </Text>
                  {workBadge ? (
                    <Text style={[styles.workBadge, active ? styles.dayTextActive : null]}>{workBadge}</Text>
                  ) : (
                    <View
                      style={[
                        styles.dayDot,
                        d.outfit ? styles.dayDotFilled : null,
                        active ? styles.dayDotActive : null,
                      ]}
                    />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
          <Text style={styles.muted}>{weekStripPlanHint()}</Text>
          {workStrip.length > 0 ? (
            <View style={styles.workwearBanner}>
              <Text style={styles.muted}>
                Workwear · {workStrip.map((d) => d.weekday).join(' · ')} planned
              </Text>
              <Button
                label={workwear.isPending ? 'Rotating…' : 'Regenerate unique'}
                size="sm"
                variant="secondary"
                disabled={workwear.isPending}
                onPress={() =>
                  workwear.mutate(workwearRegenerateBody({ unique: true }), {
                    onSuccess: (res) => {
                      void week.refetch();
                      Alert.alert(
                        'Workwear rotation',
                        `${res.days.length} weekdays · ${res.unique ? 'unique pieces' : 'best-effort reuse'}.`,
                      );
                    },
                    onError: (e) => Alert.alert('Could not plan workwear', (e as Error).message),
                  })
                }
              />
            </View>
          ) : null}
          {!days.some((d) => d.outfit) ? (
            <Button
              label={generateWeek.isPending ? 'Planning…' : 'Plan my week'}
              size="sm"
              variant="secondary"
              disabled={generateWeek.isPending}
              onPress={() =>
                generateWeek.mutate(
                  capsuleBody({ fillWeek: true }),
                  { onSuccess: () => void week.refetch() },
                )
              }
            />
          ) : null}
          <View style={styles.weekActions}>
            <Button
              label={workwear.isPending ? 'Rotating…' : 'Workwear week'}
              size="sm"
              variant="ghost"
              disabled={workwear.isPending}
              onPress={() =>
                workwear.mutate(
                  workwearRegenerateBody({ unique: true }),
                  {
                    onSuccess: (res) => {
                      void week.refetch();
                      Alert.alert(
                        'Workwear rotation',
                        `${res.days.length} weekdays planned${res.unique ? ' · unique pieces' : ''}.`,
                      );
                    },
                    onError: (e) => Alert.alert('Could not plan workwear', (e as Error).message),
                  },
                )
              }
            />
            <Button
              label={fromCalendar.isPending ? 'Mapping…' : 'From calendar'}
              size="sm"
              variant="ghost"
              disabled={fromCalendar.isPending}
              onPress={() => {
                void (async () => {
                  const status = await requestCalendarPermission();
                  if (!isCalendarPermissionGranted(status)) {
                    Alert.alert(
                      'Calendar needed',
                      'Allow calendar access to dress for interviews, weddings, and office days.',
                    );
                    return;
                  }
                  try {
                    const events = await listUpcomingCalendarEvents({ daysAhead: 14, limit: 5 });
                    if (!events.length) {
                      Alert.alert('No upcoming events', 'Nothing on your calendar in the next two weeks.');
                      return;
                    }
                    fromCalendar.mutate(
                      { events, remindNightBefore: true, commit: true },
                      {
                        onSuccess: (res) => {
                          void week.refetch();
                          const copy = calendarImportSuccessCopy(res);
                          Alert.alert(copy.title, copy.body);
                        },
                        onError: (e) =>
                          Alert.alert('Could not map calendar', (e as Error).message),
                      },
                    );
                  } catch (e) {
                    Alert.alert('Calendar error', (e as Error).message);
                  }
                })();
              }}
            />
            <Button
              label={travelPack.isPending ? 'Packing…' : 'Travel pack'}
              size="sm"
              variant="ghost"
              disabled={travelPack.isPending}
              onPress={() => {
                const start = new Date();
                const end = new Date(start.getTime() + 3 * 86_400_000);
                const toKey = (d: Date) => d.toISOString().slice(0, 10);
                travelPack.mutate(
                  { startDate: toKey(start), endDate: toKey(end), maxItems: 12 },
                  {
                    onSuccess: (pack) =>
                      Alert.alert(
                        'Travel pack shared',
                        `${pack.items.length} pieces for ${pack.nights} days — checklist has no account PII.`,
                      ),
                    onError: (e) => Alert.alert('Could not build pack', (e as Error).message),
                  },
                );
              }}
            />
            <Button
              label={weddingFestival.isPending ? 'Planning…' : 'Wedding / festival'}
              size="sm"
              variant="ghost"
              disabled={weddingFestival.isPending}
              onPress={runWeddingPlanner}
            />
            <Button
              label={interviewKit.isPending ? 'Saving…' : 'Interview kit'}
              size="sm"
              variant="ghost"
              disabled={interviewKit.isPending || !outfit?.itemIds?.length}
              onPress={() => {
                const ids = outfit?.itemIds ?? [];
                if (!ids.length) {
                  Alert.alert('Interview kit', 'Generate today’s look first, then save it as a kit.');
                  return;
                }
                const eventAt = new Date(Date.now() + 3 * 86_400_000).toISOString();
                interviewKit.mutate(
                  {
                    name: 'Interview look',
                    kind: 'interview',
                    itemIds: ids,
                    eventAt,
                    remindNightBefore: true,
                    commit: true,
                  },
                  {
                    onSuccess: (res) => {
                      void week.refetch();
                      confirmInterviewKit(res.kit);
                    },
                    onError: (e) => Alert.alert('Could not save kit', (e as Error).message),
                  },
                );
              }}
            />
          </View>
        </View>
      ) : null}

      {laundryPrompt && viewingToday && !laundryDismissed ? (
        <View style={styles.laundryCard} testID="laundry-starvation-prompt">
          <Text style={styles.packageTitle}>{laundryPrompt.title}</Text>
          <Text style={styles.muted}>{laundryPrompt.message}</Text>
          <View style={styles.weekActions}>
            <Button
              label={updateWardrobe.isPending ? 'Marking…' : laundryPrompt.markCleanCta}
              size="sm"
              variant="secondary"
              disabled={updateWardrobe.isPending}
              onPress={() => void markLaundryClean()}
            />
            <Button
              label={laundryPrompt.wearAnywayCta}
              size="sm"
              variant="ghost"
              onPress={wearAnywayFromLaundry}
            />
          </View>
        </View>
      ) : null}

      {data?.weatherRerolled && viewingToday ? (
        <Pressable
          style={styles.rerollBannerBtn}
          onPress={acceptWeatherReroll}
          accessibilityRole="button"
          accessibilityLabel={weatherCopy.cta}
          testID="weather-reroll-banner"
        >
          <Text style={styles.rerollBanner}>{weatherCopy.title}</Text>
          <Text style={styles.rerollCta}>{weatherCopy.cta}</Text>
        </Pressable>
      ) : null}

      {outfit ? (
        <View style={styles.card}>
          <Text style={styles.title}>
            {selectedDay && !selectedDay.isToday ? `${selectedDay.weekday} · ` : ''}
            {outfit.occasion ?? 'CASUAL'}
            {outfit.weatherCtx && typeof outfit.weatherCtx === 'object'
              ? ` · ${String((outfit.weatherCtx as { tempC?: number }).tempC ?? '')}° · ${String((outfit.weatherCtx as { condition?: string }).condition ?? '').replace(/_/g, ' ')}`
              : ''}
          </Text>
          <Text style={styles.muted}>
            Generated {new Date(outfit.generatedAt).toLocaleTimeString()}
            {outfit.plannedFor ? ` · ${outfit.plannedFor}` : ''}
          </Text>

          {avoidChips.length > 0 ? (
            <View style={styles.chipRow} testID="avoid-repeat-chips">
              {avoidChips.map((c) => (
                <View key={c.id} style={styles.avoidChip}>
                  <Text style={styles.avoidChipText}>{c.label}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {whyThis.length > 0 ? (
            <View style={styles.whyBox}>
              <Text style={styles.whyLabel}>Why this</Text>
              {whyThis.map((line) => (
                <Text key={line} style={styles.whyLine}>
                  · {line}
                </Text>
              ))}
            </View>
          ) : null}

          <Animated.View style={{ transform: [{ translateX: altSlideX }] }}>
          <ScrollView horizontal style={styles.row} contentContainerStyle={{ gap: space4 }}>
            {(outfit.items ?? []).map((it) => (
              <Pressable
                key={it.id}
                style={styles.itemChip}
                onPress={() => setGoesAnchor({ id: it.id, category: it.category, brand: it.brand })}
                accessibilityRole="button"
                accessibilityLabel={`What goes with ${it.category}`}
              >
                {(it.garmentImageUrl ?? it.imageUrls?.[0]) ? (
                  <Image
                    source={{ uri: (it.garmentImageUrl ?? it.imageUrls?.[0]) as string }}
                    style={styles.thumb}
                  />
                ) : null}
                <Text style={styles.muted}>{it.category}</Text>
                <Text style={styles.muted}>{it.brand ?? ''}</Text>
              </Pressable>
            ))}
          </ScrollView>
          </Animated.View>

          {viewingToday && outfit.itemIds?.length ? (
            <AccessorySlotToday
              itemIds={outfit.itemIds as string[]}
              items={(outfit.items ?? []).map((it) => ({
                id: it.id,
                category: it.category,
                brand: it.brand,
              }))}
              plannedFor={
                (outfit.plannedFor as string | null | undefined) ??
                new Date().toISOString().slice(0, 10)
              }
              disabled={wear.isPending}
              onUpdated={() => {
                void refetch();
                void week.refetch();
              }}
            />
          ) : null}

          {viewingToday ? (
            <>
              {photoUri ? (
                <View style={styles.photoPreview}>
                  <Image source={{ uri: photoUri }} style={styles.wearThumb} />
                  <Button label="Remove photo" size="sm" variant="ghost" onPress={() => setPhotoUri(null)} />
                </View>
              ) : null}

              <View style={styles.actions}>
                <View style={styles.swipeRow}>
                  <Button
                    label="← Prev"
                    size="sm"
                    variant="ghost"
                    disabled={altIndex === 0 || altFetch.isPending}
                    onPress={() => swipeAlt(-1)}
                  />
                  <Text style={styles.altLabel}>
                    {altIndex === 0 ? 'Primary look' : `Alt #${altIndex + 1}`}
                  </Text>
                  <Button
                    label="Next →"
                    size="sm"
                    variant="ghost"
                    disabled={!hasMoreAlts || altFetch.isPending}
                    onPress={() => swipeAlt(1)}
                  />
                </View>
                {altIndex > 0 ? (
                  <Button
                    label={selectOutfit.isPending ? 'Saving…' : 'Use this look'}
                    size="sm"
                    variant="secondary"
                    disabled={selectOutfit.isPending}
                    onPress={commitAlt}
                  />
                ) : null}
                <Button
                  label="Ask a friend"
                  size="sm"
                  variant="secondary"
                  onPress={() => void askFriendWhichLook()}
                />
                <Button
                  label={wear.isPending ? 'Snapping…' : 'Snap & log wear'}
                  size="sm"
                  variant="secondary"
                  disabled={wear.isPending}
                  onPress={() => void snapWearPhoto({ autoLog: true })}
                />
                <Button
                  label={photoUri ? 'Retake photo' : 'Attach photo'}
                  size="sm"
                  variant="ghost"
                  onPress={() => void snapWearPhoto({ autoLog: false })}
                />
                <Button
                  label={wear.isPending ? 'Logging…' : photoUri ? 'I wore this (with photo)' : 'I wore this'}
                  block
                  disabled={wear.isPending}
                  onPress={logWoreIt}
                />
                <Button
                  label={generateWeek.isPending ? 'Regenerating…' : 'Regenerate'}
                  size="sm"
                  variant="ghost"
                  disabled={generateWeek.isPending}
                  onPress={regenerateDay}
                />
              </View>
            </>
          ) : (
            <View style={styles.actions}>
              <Button
                label={generateWeek.isPending ? 'Regenerating…' : `Regenerate ${selectedDay?.weekday ?? 'day'}`}
                size="sm"
                variant="secondary"
                disabled={generateWeek.isPending}
                onPress={regenerateDay}
              />
            </View>
          )}
        </View>
      ) : selectedDay && !selectedDay.outfit ? (
        <View style={styles.card}>
          <Text style={styles.title}>{selectedDay.weekday} — no outfit yet</Text>
          <Button
            label={generateWeek.isPending ? 'Generating…' : 'Generate this day'}
            onPress={regenerateDay}
            disabled={generateWeek.isPending}
          />
        </View>
      ) : null}

      <GoesWithSheet
        visible={Boolean(goesAnchor)}
        anchor={goesAnchor}
        onClose={() => setGoesAnchor(null)}
        onTryOnToday={tryGoesWithOnToday}
      />
      <AvatarOutfitReveal
        visible={showAvatarReveal}
        occasion={outfit?.occasion}
        onDone={() => setShowAvatarReveal(false)}
      />
      </PremiumGate>
    </ClosetScreen>
  );
}

const styles = StyleSheet.create({
  actions: { gap: space4, marginTop: space4 },
  altLabel: {
    color: closet.muted,
    flex: 1,
    fontFamily: fontSans,
    fontSize: fsCaption,
    fontWeight: '600',
    textAlign: 'center',
  },
  swipeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space4,
    justifyContent: 'space-between',
  },
  card: {
    backgroundColor: closet.surface,
    borderColor: closet.rule,
    borderRadius: radiusMd,
    borderWidth: 1,
    padding: space4,
  },
  capsuleCopy: { flex: 1, gap: 2 },
  capsuleRow: {
    alignItems: 'center',
    backgroundColor: closet.surface,
    borderColor: closet.rule,
    borderRadius: radiusMd,
    borderWidth: 1,
    flexDirection: 'row',
    gap: space4,
    marginBottom: space4,
    padding: space4,
  },
  dayChip: {
    alignItems: 'center',
    borderColor: closet.rule,
    borderRadius: radiusMd,
    borderWidth: 1,
    gap: 4,
    minWidth: 48,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  dayChipActive: {
    backgroundColor: closet.ink,
    borderColor: closet.ink,
  },
  dayChipWork: {
    borderColor: closet.accent,
  },
  dayDate: { color: closet.ink, fontFamily: fontSans, fontSize: fsCaption, fontWeight: '600' },
  dayDot: {
    backgroundColor: closet.mist,
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  dayDotActive: { backgroundColor: closet.surface },
  dayDotFilled: { backgroundColor: closet.accent },
  dayTextActive: { color: closet.surface },
  dayWeekday: { color: closet.muted, fontFamily: fontSans, fontSize: 11 },
  itemChip: { alignItems: 'center', gap: 4 },
  muted: { color: closet.muted, fontFamily: fontSans, fontSize: fsCaption },
  photoPreview: { alignItems: 'flex-start', gap: space4, marginTop: space4 },
  avoidChip: {
    backgroundColor: closet.accentBg,
    borderColor: closet.accent,
    borderRadius: radiusMd,
    borderWidth: 1,
    paddingHorizontal: space3,
    paddingVertical: 6,
  },
  avoidChipText: {
    color: closet.ink,
    fontFamily: fontSans,
    fontSize: fsCaption,
    fontWeight: '600',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space3,
    marginTop: space3,
  },
  laundryCard: {
    backgroundColor: closet.surface,
    borderColor: closet.accent,
    borderRadius: radiusMd,
    borderWidth: 1,
    gap: 6,
    marginBottom: space4,
    padding: space4,
  },
  rerollBanner: {
    color: closet.accent,
    fontFamily: fontSans,
    fontSize: fsCaption,
    fontWeight: '600',
  },
  rerollBannerBtn: {
    backgroundColor: closet.accentBg,
    borderColor: closet.accent,
    borderRadius: radiusMd,
    borderWidth: 1,
    gap: 4,
    marginBottom: space4,
    padding: space4,
  },
  rerollCta: {
    color: closet.ink,
    fontFamily: fontSans,
    fontSize: fsCaption,
    fontWeight: '700',
  },
  row: { marginTop: space4 },
  thumb: {
    width: 90,
    height: 120,
    borderRadius: radiusMd,
    backgroundColor: closet.mist,
  },
  title: {
    color: closet.ink,
    fontFamily: fontSans,
    fontSize: fsBody,
    fontWeight: '700',
  },
  wearThumb: {
    width: '100%',
    height: 160,
    borderRadius: radiusMd,
    backgroundColor: closet.mist,
  },
  weekLabel: {
    color: closet.muted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    fontWeight: '600',
    marginBottom: 8,
  },
  weekRow: { gap: space4, marginBottom: space4 },
  weekStrip: { gap: 8 },
  weekActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space4 },
  workBadge: {
    color: closet.accent,
    fontFamily: fontSans,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  workwearBanner: {
    backgroundColor: closet.accentBg,
    borderRadius: radiusMd,
    gap: space4,
    padding: space4,
  },
  packageCard: {
    backgroundColor: closet.surface,
    borderColor: closet.rule,
    borderRadius: radiusMd,
    borderWidth: 1,
    gap: 6,
    marginBottom: space4,
    padding: space4,
  },
  packageTitle: {
    color: closet.ink,
    fontFamily: fontSans,
    fontSize: fsBody,
    fontWeight: '700',
  },
  whyBox: {
    backgroundColor: closet.accentBg,
    borderRadius: radiusMd,
    marginTop: space4,
    padding: space4,
  },
  whyLabel: {
    color: closet.accent,
    fontFamily: fontSans,
    fontSize: fsCaption,
    fontWeight: '700',
    marginBottom: 4,
  },
  whyLine: {
    color: closet.inkSoft,
    fontFamily: fontSans,
    fontSize: fsCaption,
    lineHeight: 18,
  },
});
