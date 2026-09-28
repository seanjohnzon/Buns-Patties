// QR landing page (web only). The QR code on the truck points here:
// installed app  -> opens via universal link / app scheme
// not installed  -> shows store buttons. Fill in store URLs in README step 7.
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { Button, H1, Muted } from '@/components/ui';
import { theme } from '@/lib/theme';

const IOS_URL = process.env.EXPO_PUBLIC_APP_STORE_URL ?? '';
const ANDROID_URL = process.env.EXPO_PUBLIC_PLAY_STORE_URL ?? '';

export default function QrLanding() {
  const ua = Platform.OS === 'web' && typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isIOS = /iPhone|iPad/.test(ua);
  const url = isIOS ? IOS_URL : ANDROID_URL;
  return (
    <View style={s.wrap}>
      <Text style={s.logo}>🍔</Text>
      <H1 style={{ color: '#fff', textAlign: 'center' }}>Your first drink{'\n'}is on us.</H1>
      <Muted style={{ color: 'rgba(255,255,255,0.85)', textAlign: 'center' }}>Get the app, follow us or leave a review, and claim it with your next order. Order ahead and skip the queue.</Muted>
      <Button title={isIOS ? 'Get it on the App Store' : 'Get it on Google Play'} style={{ backgroundColor: theme.colors.accent, marginTop: 12 }} onPress={() => url && Linking.openURL(url)} />
      <Button title="Open the app" variant="ghost" onPress={() => Linking.openURL('bunspatties://')} />
    </View>
  );
}
const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.colors.brand, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  logo: { fontSize: 72 },
});
