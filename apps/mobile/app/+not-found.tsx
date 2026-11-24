import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { LoadError } from '@/src/components/ui';
import { goBack } from '@/src/lib/goBack';
import { bg, space6 } from '@/src/theme/tokens';

/** A link to a screen that doesn't exist (an old push, a mistyped URL): a way back into the app. */
export default function NotFoundScreen() {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <LoadError
        body="This link doesn’t lead anywhere in WORN any more."
        onSecondary={() => goBack(router)}
        secondaryLabel="Back to WORN"
        title="Page not found"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: bg,
    flex: 1,
    justifyContent: 'center',
    padding: space6,
  },
});
