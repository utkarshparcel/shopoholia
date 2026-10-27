import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';

/** Calls `callback` each time the app returns to the foreground. Returns the unsubscribe. */
export function onAppActive(callback: () => void): () => void {
  const subscription = AppState.addEventListener('change', (status) => {
    if (status === 'active') callback();
  });
  return () => subscription?.remove();
}

/** Calls `callback` each time the device goes from offline back online. Returns the unsubscribe. */
export function onNetworkRegained(callback: () => void): () => void {
  let offline = false;
  return NetInfo.addEventListener((state) => {
    const nowOffline = state.isConnected === false || state.isInternetReachable === false;
    if (offline && !nowOffline) callback();
    offline = nowOffline;
  });
}
