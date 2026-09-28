// Rewards, as a customer sees them: whatever the owner is currently giving away,
// then how far they are from the next free thing — in money, never in points.
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View, ScrollView } from 'react-native';
import { Body, Button, Card, H2, Muted, Row, Screen } from '@/components/ui';
import { WelcomeOffer } from '@/components/WelcomeOffer';
import { getItem, getProfile, getRewards } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { progressTo, spendToGo } from '@/lib/points';
import { theme } from '@/lib/theme';
import type { Profile, Reward } from '@/lib/types';

export default function Rewards() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const add = useCart((s) => s.add);
  const router = useRouter();

  const load = useCallback(() => {
    getProfile().then(setProfile);
    getRewards().then(setRewards);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const balance = profile?.points ?? 0;
  const next = rewards.find((r) => r.pointsCost > balance) ?? rewards[rewards.length - 1];

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>

        <WelcomeOffer />

        {next && (
          <Card style={{ gap: 10 }}>
            <H2>Your next free thing</H2>
            <Row style={{ justifyContent: 'space-between' }}>
              <Body style={{ fontWeight: '700' }}>{next.name}</Body>
              <Muted>{spendToGo(balance, next.pointsCost) === 0 ? 'Earned' : `$${spendToGo(balance, next.pointsCost)} of orders to go`}</Muted>
            </Row>
            <View style={st.track}><View style={[st.fill, { width: `${progressTo(balance, next.pointsCost) * 100}%` }]} /></View>
            <Muted>Every order in the app gets you closer. Nothing to scan or show.</Muted>
          </Card>
        )}

        <View style={{ gap: 10 }}>
          <H2>What you're working towards</H2>
          {rewards.map((r) => {
            const togo = spendToGo(balance, r.pointsCost);
            return (
              <Card key={r.id}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Body style={{ fontWeight: '600' }}>{r.name}</Body>
                    <Muted>{togo === 0 ? 'Ready to use' : `$${togo} of orders away`}</Muted>
                  </View>
                  {togo === 0 && (
                    <Button title="Use it" onPress={async () => {
                      const item = r.menuItemId ? await getItem(r.menuItemId) : undefined;
                      if (!item) return;
                      const group = item.modifierGroups.find((g) => g.required);
                      add({ ...item, price: 0, name: `${item.name} (reward)` }, group ? [group.options[0]] : [], 1, undefined, { reward: r.id });
                      router.push('/cart');
                    }} />
                  )}
                </Row>
              </Card>
            );
          })}
        </View>

        <Link href="/(tabs)/menu" asChild><Button title="Order something" variant="secondary" /></Link>
      </ScrollView>
    </Screen>
  );
}

const st = StyleSheet.create({
  track: { height: 8, backgroundColor: theme.colors.bgMuted, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, backgroundColor: theme.colors.accent },
});
