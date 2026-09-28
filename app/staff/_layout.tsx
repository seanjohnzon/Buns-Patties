import { Stack } from 'expo-router';
import { RequireRole } from '@/components/RequireRole';
import { theme } from '@/lib/theme';

export default function StaffLayout() {
  return (
    <RequireRole need="staff">
      <Stack screenOptions={{ headerTintColor: theme.colors.text, headerShadowVisible: false, contentStyle: { backgroundColor: theme.colors.bg } }}>
        <Stack.Screen name="index" options={{ title: 'Kitchen' }} />
        <Stack.Screen name="status" options={{ title: 'Truck status' }} />
      </Stack>
    </RequireRole>
  );
}
