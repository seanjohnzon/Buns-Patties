import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@/lib/theme';
import type { OrderStatus } from '@/lib/types';

const STEPS: { key: OrderStatus; label: string }[] = [
  { key: 'received', label: 'Received' },
  { key: 'preparing', label: 'Cooking' },
  { key: 'ready', label: 'Ready for pickup' },
];

export function OrderStatusStepper({ status }: { status: OrderStatus }) {
  const idx = STEPS.findIndex((s) => s.key === status);
  const current = status === 'completed' ? STEPS.length : idx;
  return (
    <View style={s.wrap}>
      {STEPS.map((st, i) => {
        const done = i <= current;
        return (
          <View key={st.key} style={s.step}>
            <View style={[s.dot, done && s.dotOn]}>{done && <Text style={s.check}>✓</Text>}</View>
            <Text style={[s.label, done && s.labelOn]}>{st.label}</Text>
            {i < STEPS.length - 1 && <View style={[s.line, i < current && s.lineOn]} />}
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 0 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 44 },
  dot: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' },
  dotOn: { backgroundColor: theme.colors.success, borderColor: theme.colors.success },
  check: { color: '#fff', fontWeight: '800', fontSize: 13 },
  label: { fontSize: 16, color: theme.colors.textMuted },
  labelOn: { color: theme.colors.text, fontWeight: '600' },
  line: { position: 'absolute', left: 12, top: 35, width: 2, height: 18, backgroundColor: theme.colors.border },
  lineOn: { backgroundColor: theme.colors.success },
});
