import { StripeProvider } from '@/lib/stripe';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { configureForeground } from '@/lib/push';
import { theme } from '@/lib/theme';

export { ErrorBoundary } from 'expo-router';
export const unstable_settings = { initialRouteName: '(tabs)' };

SplashScreen.preventAutoHideAsync();
configureForeground();

const STRIPE_PK = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? 'pk_test_placeholder';

export default function RootLayout() {
  useEffect(() => { SplashScreen.hideAsync(); }, []);

  const nav = (
    <Stack screenOptions={{ headerTintColor: theme.colors.text, headerShadowVisible: false, contentStyle: { backgroundColor: theme.colors.bg } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="item/[id]" options={{ presentation: 'modal', title: '' }} />
      <Stack.Screen name="cart" options={{ presentation: 'modal', title: 'Your order' }} />
      <Stack.Screen name="order/[id]" options={{ title: 'Order status' }} />
      {/* staff/ and owner/ carry their own layouts, which gate on role. */}
      <Stack.Screen name="staff" options={{ headerShown: false }} />
      <Stack.Screen name="owner" options={{ headerShown: false }} />
      <Stack.Screen name="auth" options={{ presentation: 'modal', title: 'Sign in' }} />
      <Stack.Screen name="qr" options={{ headerShown: false }} />
      <Stack.Screen name="demo" options={{ headerShown: false }} />
      <Stack.Screen name="feedback" options={{ presentation: 'modal', title: '' }} />
    </Stack>
  );

  return (
    <StripeProvider publishableKey={STRIPE_PK} merchantIdentifier="merchant.com.bunspatties.app">
      {nav}
    </StripeProvider>
  );
}
