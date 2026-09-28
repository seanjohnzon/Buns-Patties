import { Stack } from 'expo-router';
import { RequireRole } from '@/components/RequireRole';
import { theme } from '@/lib/theme';

export default function OwnerLayout() {
  return (
    <RequireRole need="owner">
      <Stack screenOptions={{ headerTintColor: theme.colors.text, headerShadowVisible: false, contentStyle: { backgroundColor: theme.colors.bg } }}>
        <Stack.Screen name="index" options={{ title: 'Your truck' }} />
        <Stack.Screen name="people" options={{ title: 'Staff' }} />
        <Stack.Screen name="feedback" options={{ title: 'What people say' }} />
        <Stack.Screen name="campaigns" options={{ title: 'Campaigns' }} />
        <Stack.Screen name="page" options={{ title: 'The truck page' }} />
      </Stack>
    </RequireRole>
  );
}
