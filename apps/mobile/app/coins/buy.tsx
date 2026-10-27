import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCoinBalance } from '@/src/hooks/orders';
import { useCoinShop, type ShopNotice, type ShopPack } from '@/src/lib/purchases/useCoinShop';
import {
  bg,
  border,
  fontDisplay,
  fontMono,
  fontSans,
  fontSansMedium,
  fontSansSemiBold,
  fsBody,
  fsBodyL,
  fsCaption,
  fsDisplayM,
  fsMicro,
  radiusCard,
  radiusLg,
  sale,
  space4,
  space6,
  success,
  surface,
  text,
  textBody,
  textMuted,
  trackingTight,
  wornGold,
  wornGoldDeep,
  wornGoldTint,
  wornInk,
  wornPaper,
} from '@/src/theme/tokens';

type NoticeCopy = { title: string; body: string; tone: 'good' | 'info' | 'bad'; action?: 'done' | 'check' };

function noticeCopy(notice: ShopNotice): NoticeCopy {
  switch (notice.kind) {
    case 'added':
      return {
        title: `${notice.coins.toLocaleString()} coins added`,
        body: `Your balance is now ${notice.balanceAfter.toLocaleString()} coins.`,
        tone: 'good',
        action: 'done',
      };
    case 'pending':
      return {
        title: 'Waiting for approval',
        body: 'Your coins will be added as soon as the purchase is approved.',
        tone: 'info',
      };
    case 'confirming':
      return {
        title: "We couldn't confirm your purchase yet",
        body: "We'll add your coins as soon as we can.",
        tone: 'info',
        action: 'check',
      };
    case 'conflict':
      return {
        title: 'This purchase was already added to another Worn account',
        body: 'Sign in with the account that made it to use its coins.',
        tone: 'bad',
      };
    case 'refunded':
      return {
        title: 'This purchase was refunded',
        body: 'No coins were added.',
        tone: 'bad',
      };
    case 'rejected':
      return {
        title: "We couldn't confirm this purchase",
        body: 'If you were charged, contact Worn support.',
        tone: 'bad',
      };
    case 'failed':
      return {
        title: "The purchase didn't go through",
        body: 'Please try again.',
        tone: 'bad',
      };
  }
}

function StateMessage({ title, body, onRetry }: { title: string; body?: string; onRetry?: () => void }) {
  return (
    <View accessibilityRole="summary" style={styles.stateCard}>
      <Text style={styles.stateTitle}>{title}</Text>
      {body ? <Text style={styles.stateBody}>{body}</Text> : null}
      {onRetry ? (
        <Pressable accessibilityRole="button" onPress={onRetry} style={styles.noticeButton}>
          <Text style={styles.noticeButtonText}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function BuyCoinsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: balanceData } = useCoinBalance();
  const { view, notice, purchasingId, confirmingProductIds, buy, checkAgain, reload } = useCoinShop();
  const copy = notice ? noticeCopy(notice) : null;

  const renderPack = (pack: ShopPack) => {
    const loading = purchasingId === pack.id;
    const confirming = confirmingProductIds.includes(pack.storeProductId);
    const disabled = purchasingId !== null || confirming;
    const price = pack.sample ? `Sample ${pack.priceString}` : pack.priceString;

    return (
      <Pressable
        key={pack.id}
        accessibilityLabel={`Buy ${pack.coins} coins for ${price}`}
        accessibilityRole="button"
        accessibilityState={{ busy: loading, disabled }}
        disabled={disabled}
        onPress={() => void buy(pack)}
        style={({ pressed }) => [
          styles.packCard,
          pack.popular && styles.packCardPopular,
          disabled && !loading && styles.packCardDisabled,
          pressed && { opacity: 0.85 },
        ]}
      >
        {pack.popular ? (
          <View style={styles.popularBadge}>
            <Text style={styles.popularText}>Most popular</Text>
          </View>
        ) : null}
        {pack.bestValue ? (
          <View style={[styles.popularBadge, styles.bestValueBadge]}>
            <Text style={styles.popularText}>Best value</Text>
          </View>
        ) : null}

        <Text style={styles.packCoins}>{pack.coins.toLocaleString()}</Text>
        <Text style={styles.packLabel}>{pack.label}</Text>

        {loading ? (
          <ActivityIndicator color={wornInk} style={styles.packLoader} />
        ) : (
          <View style={styles.packPriceRow}>
            <Text style={styles.packPrice}>{confirming ? 'Confirming…' : price}</Text>
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <ScrollView
      contentContainerStyle={{
        paddingBottom: insets.bottom + space6,
        paddingTop: insets.top + space4,
      }}
      style={styles.screen}
    >
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>

      <View style={styles.heroSection}>
        <View style={styles.coinIconLarge}>
          <View style={styles.coinIconInner} />
        </View>
        <Text style={styles.heroTitle}>Get more coins</Text>
        <Text style={styles.heroBody}>
          Unlock premium renders, generate new scenes, and combine items into full looks.
        </Text>
        {balanceData ? (
          <View style={styles.currentBalance}>
            <Text style={styles.balanceLabel}>Your balance</Text>
            <Text style={styles.balanceValue} testID="coin-balance">
              {balanceData.balance.toLocaleString()} coins
            </Text>
          </View>
        ) : null}
      </View>

      {copy ? (
        <View
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={[
            styles.notice,
            copy.tone === 'good' && styles.noticeGood,
            copy.tone === 'bad' && styles.noticeBad,
          ]}
          testID="purchase-notice"
        >
          <Text style={styles.noticeTitle}>{copy.title}</Text>
          <Text style={styles.noticeBody}>{copy.body}</Text>
          {copy.action === 'done' ? (
            <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.noticeButton}>
              <Text style={styles.noticeButtonText}>Done</Text>
            </Pressable>
          ) : null}
          {copy.action === 'check' ? (
            <Pressable accessibilityRole="button" onPress={checkAgain} style={styles.noticeButton}>
              <Text style={styles.noticeButtonText}>Check again</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {view.status === 'signed_out' ? <StateMessage title="Sign in to buy coins." /> : null}
      {view.status === 'no_store' ? (
        <StateMessage
          title="Coin packs aren't available on this device yet."
          body="Coins are sold through the App Store and Google Play in the Worn app."
        />
      ) : null}
      {view.status === 'unavailable' ? (
        <StateMessage
          title="Coin purchases aren't available right now."
          body="Please try again later."
          onRetry={reload}
        />
      ) : null}
      {view.status === 'error' ? (
        <StateMessage title="Couldn't load coin packs." onRetry={reload} />
      ) : null}
      {view.status === 'loading' ? <ActivityIndicator color={wornInk} style={styles.packLoader} /> : null}
      {view.status === 'ready' ? <View style={styles.packGrid}>{view.packs.map(renderPack)}</View> : null}

      <View style={styles.perksCard}>
        <Text style={styles.perksTitle}>What you can do with coins</Text>
        <View style={styles.perkRow}>
          <Text style={styles.perkIcon}>✦</Text>
          <Text style={styles.perkText}>Unlock premium scenes (50 coins each)</Text>
        </View>
        <View style={styles.perkRow}>
          <Text style={styles.perkIcon}>✦</Text>
          <Text style={styles.perkText}>Generate new renders in any scenario (50 coins)</Text>
        </View>
        <View style={styles.perkRow}>
          <Text style={styles.perkIcon}>✦</Text>
          <Text style={styles.perkText}>Combine items into full looks (75 coins)</Text>
        </View>
        <View style={styles.perkRow}>
          <Text style={styles.perkIcon}>✦</Text>
          <Text style={styles.perkText}>Rush delivery to Express tier (25 coins)</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  back: {
    marginBottom: space4,
    paddingHorizontal: space4,
  },
  backText: {
    color: textMuted,
    fontFamily: fontSansMedium,
    fontSize: fsBody,
  },
  balanceLabel: {
    color: textMuted,
    fontFamily: fontMono,
    fontSize: fsMicro,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  balanceValue: {
    color: text,
    fontFamily: fontSansSemiBold,
    fontSize: 24,
  },
  bestValueBadge: {
    backgroundColor: wornGoldDeep,
  },
  coinIconInner: {
    borderColor: 'rgba(255,255,255,0.45)',
    borderRadius: 8,
    borderWidth: 1.5,
    height: 16,
    width: 16,
  },
  coinIconLarge: {
    alignItems: 'center',
    backgroundColor: wornGold,
    borderRadius: 40,
    height: 80,
    justifyContent: 'center',
    marginBottom: space4,
    width: 80,
  },
  currentBalance: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    marginTop: space4,
  },
  heroBody: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsBody,
    lineHeight: 22,
    paddingHorizontal: space6,
    textAlign: 'center',
  },
  heroSection: {
    alignItems: 'center',
    gap: 8,
    marginBottom: space6,
    paddingHorizontal: space4,
  },
  heroTitle: {
    color: text,
    fontFamily: fontDisplay,
    fontSize: fsDisplayM,
    letterSpacing: fsDisplayM * trackingTight,
  },
  notice: {
    backgroundColor: surface,
    borderColor: border,
    borderRadius: radiusCard,
    borderWidth: 1,
    gap: 6,
    marginBottom: space4,
    marginHorizontal: space4,
    padding: space4,
  },
  noticeBad: {
    borderColor: sale,
  },
  noticeBody: {
    color: textBody,
    fontFamily: fontSans,
    fontSize: fsCaption,
    lineHeight: 20,
  },
  noticeButton: {
    alignSelf: 'flex-start',
    backgroundColor: wornInk,
    borderRadius: 999,
    marginTop: 6,
    paddingHorizontal: space4,
    paddingVertical: 8,
  },
  noticeButtonText: {
    color: wornPaper,
    fontFamily: fontSansSemiBold,
    fontSize: fsCaption,
  },
  noticeGood: {
    borderColor: success,
  },
  noticeTitle: {
    color: text,
    fontFamily: fontSansSemiBold,
    fontSize: fsBody,
  },
  packCard: {
    backgroundColor: surface,
    borderColor: border,
    borderRadius: radiusLg,
    borderWidth: 1,
    flex: 1,
    flexBasis: '40%',
    gap: 8,
    minHeight: 140,
    padding: space4,
    position: 'relative',
  },
  packCardDisabled: {
    opacity: 0.55,
  },
  packCardPopular: {
    borderColor: wornGold,
    backgroundColor: wornGoldTint,
  },
  packCoins: {
    color: text,
    fontFamily: fontDisplay,
    fontSize: 28,
    letterSpacing: fsDisplayM * trackingTight,
  },
  packGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space4,
    paddingHorizontal: space4,
  },
  packLabel: {
    color: textMuted,
    fontFamily: fontMono,
    fontSize: fsMicro,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  packLoader: {
    marginTop: 8,
  },
  packPrice: {
    color: text,
    fontFamily: fontSansSemiBold,
    fontSize: fsBodyL,
  },
  packPriceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    marginTop: 'auto',
  },
  perkIcon: {
    color: wornGoldDeep,
    fontSize: 12,
    width: 20,
  },
  perkRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  perkText: {
    color: textBody,
    fontFamily: fontSans,
    fontSize: fsCaption,
    lineHeight: 20,
    flex: 1,
  },
  perksCard: {
    backgroundColor: surface,
    borderColor: border,
    borderRadius: radiusCard,
    borderWidth: 1,
    gap: 10,
    marginHorizontal: space4,
    marginTop: space6,
    padding: space4,
  },
  perksTitle: {
    color: text,
    fontFamily: fontSansSemiBold,
    fontSize: fsBody,
    marginBottom: 4,
  },
  popularBadge: {
    alignSelf: 'flex-start',
    backgroundColor: wornGold,
    borderRadius: 999,
    marginBottom: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  popularText: {
    color: wornPaper,
    fontFamily: fontMono,
    fontSize: 8,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  screen: {
    backgroundColor: bg,
    flex: 1,
  },
  stateBody: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    lineHeight: 20,
  },
  stateCard: {
    backgroundColor: surface,
    borderColor: border,
    borderRadius: radiusCard,
    borderWidth: 1,
    gap: 6,
    marginHorizontal: space4,
    padding: space4,
  },
  stateTitle: {
    color: text,
    fontFamily: fontSansSemiBold,
    fontSize: fsBody,
  },
});
