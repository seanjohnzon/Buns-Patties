import { Pressable, StyleSheet, Text, View, type PressableProps, type TextProps, type ViewProps } from 'react-native';
import { theme } from '@/lib/theme';

export const money = (n: number) => '$' + n.toFixed(2);

export function Screen({ style, ...p }: ViewProps) {
  return <View {...p} style={[{ flex: 1, backgroundColor: theme.colors.bg }, style]} />;
}

export function H1(p: TextProps) { return <Text {...p} style={[s.h1, p.style]} />; }
export function H2(p: TextProps) { return <Text {...p} style={[s.h2, p.style]} />; }
export function Body(p: TextProps) { return <Text {...p} style={[s.body, p.style]} />; }
export function Muted(p: TextProps) { return <Text {...p} style={[s.muted, p.style]} />; }

export function Button({ title, variant = 'primary', style, disabled, ...p }: PressableProps & { title: string; variant?: 'primary' | 'secondary' | 'ghost' }) {
  return (
    <Pressable
      {...p}
      disabled={disabled}
      style={({ pressed }) => [s.btn, (s as any)['btn_' + variant], disabled && { opacity: 0.4 }, pressed && { opacity: 0.8 }, style as any]}>
      <Text style={[s.btnText, variant !== 'primary' && { color: theme.colors.brand }]}>{title}</Text>
    </Pressable>
  );
}

export function Card({ style, ...p }: ViewProps) {
  return <View {...p} style={[s.card, style]} />;
}

export function Pill({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.pill, active && { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand }]}>
      <Text style={[s.pillText, active && { color: theme.colors.white }]}>{label}</Text>
    </Pressable>
  );
}

export function Row({ style, ...p }: ViewProps) {
  return <View {...p} style={[{ flexDirection: 'row', alignItems: 'center' }, style]} />;
}

export function Stepper({ qty, onChange }: { qty: number; onChange: (q: number) => void }) {
  return (
    <Row style={{ gap: 12 }}>
      <Pressable onPress={() => onChange(qty - 1)} style={s.stepBtn}><Text style={s.stepTxt}>−</Text></Pressable>
      <Text style={{ fontSize: 18, fontWeight: '600', minWidth: 20, textAlign: 'center' }}>{qty}</Text>
      <Pressable onPress={() => onChange(qty + 1)} style={s.stepBtn}><Text style={s.stepTxt}>+</Text></Pressable>
    </Row>
  );
}

const s = StyleSheet.create({
  h1: { fontSize: theme.font.h1, fontWeight: '700', color: theme.colors.text },
  h2: { fontSize: theme.font.h2, fontWeight: '600', color: theme.colors.text },
  body: { fontSize: theme.font.body, color: theme.colors.text },
  muted: { fontSize: theme.font.small, color: theme.colors.textMuted },
  btn: { paddingVertical: 14, paddingHorizontal: 20, borderRadius: theme.radius.pill, alignItems: 'center', justifyContent: 'center' },
  btn_primary: { backgroundColor: theme.colors.brand },
  btn_secondary: { backgroundColor: theme.colors.bgMuted },
  btn_ghost: { backgroundColor: 'transparent' },
  btnText: { color: theme.colors.white, fontWeight: '700', fontSize: 16 },
  card: { backgroundColor: theme.colors.bg, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.space.md },
  pill: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.bg },
  pillText: { fontWeight: '600', color: theme.colors.text },
  stepBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: theme.colors.bgMuted, alignItems: 'center', justifyContent: 'center' },
  stepTxt: { fontSize: 20, fontWeight: '600' },
});
