// Order notifications.
//
// The webhook sends to profiles.expo_push_token — but nothing was ever writing
// one, so notifications would have silently never arrived. This registers it
// after sign-in and keeps it current.
//
// Web has no push here (it would need a service worker and a VAPID key), so it
// is skipped rather than half-done: the order screen updates live anyway.
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export type PushResult = 'saved' | 'denied' | 'unsupported' | 'failed';

export async function registerForPush(
  save: (token: string) => Promise<void>,
): Promise<PushResult> {
  if (Platform.OS === 'web') return 'unsupported';
  // A simulator cannot receive a real push.
  if (!Constants.isDevice) return 'unsupported';

  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return 'denied';

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('orders', {
        name: 'Your order',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    if (!data) return 'failed';
    await save(data);
    return 'saved';
  } catch {
    // Never let a notification problem stop somebody ordering.
    return 'failed';
  }
}

/** Show the banner even when the app is open — the kitchen moves fast. */
export function configureForeground() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}
