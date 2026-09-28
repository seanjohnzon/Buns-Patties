import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '@/lib/theme';
import { progressTo, spendToGo } from '@/lib/points';
import { Muted } from './ui';

// Progress towards the next free thing, in money. Never a points balance —
// the conversion rate is ours to tune, not a number we publish.
export function PointsCard({ points, nextRewardAt, nextRewardName }: { points: number; nextRewardAt?: number; nextRewardName?: string }) {
  const pct = progressTo(points, nextRewardAt ?? 0);
  const togo = spendToGo(points, nextRewardAt ?? 0);
  return (
    <Link href="/(tabs)/rewards" asChild>
      <Pressable style={s.card}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>NEXT ON US</Text>
            <Text style={s.points} numberOfLines={1}>{nextRewardName ?? 'Order to start earning'}</Text>
          </View>
          {nextRewardName && (
            <Text style={s.next}>{togo === 0 ? 'Ready' : `$${togo} to go`}</Text>
          )}
        </View>
        <View style={s.track}><View style={[s.fill, { width: `${pct * 100}%` }]} /></View>
      </Pressable>
    </Link>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: theme.colors.brand, borderRadius: theme.radius.lg, padding: 18, gap: 12 },
  label: { color: 'rgba(255,255,255,0.8)', fontWeight: '600', fontSize: 13 },
  points: { color: '#fff', fontSize: 22, fontWeight: '800' },
  next: { color: theme.colors.accent, fontWeight: '700', fontSize: 13 },
  track: { height: 8, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, backgroundColor: theme.colors.accent },
});
