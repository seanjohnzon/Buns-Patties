// Rewards, as a customer sees them: whatever the owner is currently giving away,
// then how far they are from the next free thing — in money, never in points.
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View, ScrollView } from 'react-native';
import { MIN_AWAY_MS, useLeftTheApp } from '@/components/useLeftTheApp';
import { Body, Button, Card, H1, H2, Muted, Row, Screen } from '@/components/ui';
import { claimCampaign, getCampaigns, getItem, getMyCampaignClaims, getProfile, getRewards } from '@/lib/api';
import { actionIsUsable, canClaim, isUnspent, remainingClaims, type Campaign, type CampaignAction, type CampaignClaim } from '@/lib/campaigns';
import { useCart } from '@/lib/cart';
import { progressTo, spendToGo } from '@/lib/points';
import { theme } from '@/lib/theme';
import type { Profile, Reward } from '@/lib/types';

export default function Rewards() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [claims, setClaims] = useState<CampaignClaim[]>([]);
  const add = useCart((s) => s.add);
  const router = useRouter();
  const pending = useRef<{ campaignId: string; actionId: string } | null>(null);

  const load = useCallback(() => {
    getProfile().then(setProfile);
    getRewards().then(setRewards);
    getCampaigns().then(setCampaigns).catch(() => {});
    getMyCampaignClaims().then(setClaims).catch(() => {});
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // They only get the offer once they have actually been away and come back.
  const { arm, disarm } = useLeftTheApp(async (awayMs) => {
    const p = pending.current;
    pending.current = null;
    if (!p) return;
    if (awayMs < MIN_AWAY_MS) {
      Alert.alert('Not quite', 'Have a proper look, then come back and it’s yours.');
      return;
    }
    try { await claimCampaign(p.campaignId, p.actionId); load(); }
    catch (e: any) { Alert.alert('Could not unlock that', e.message ?? String(e)); }
  });

  async function doAction(c: Campaign, a: CampaignAction) {
    // A dead link must never be a free drink.
    if (!actionIsUsable(a)) { Alert.alert('Not ready yet', 'That link isn’t set up. Try the other one.'); return; }
    pending.current = { campaignId: c.id, actionId: a.id };
    arm();
    try { await Linking.openURL(a.url); }
    catch { pending.current = null; disarm(); Alert.alert('Could not open that'); }
  }

  async function useOffer(c: Campaign) {
    if (!c.rewardItemId) return;
    const item = await getItem(c.rewardItemId);
    if (!item) return;
    const group = item.modifierGroups.find((g) => g.required);
    add({ ...item, price: 0, name: `${item.name} (on us)` }, group ? [group.options[0]] : [], 1, undefined, { campaign: c.id });
    router.push('/cart');
  }

  const balance = profile?.points ?? 0;
  const next = rewards.find((r) => r.pointsCost > balance) ?? rewards[rewards.length - 1];

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>

        {campaigns.map((c) => {
          const claim = claims.find((x) => x.campaignId === c.id);
          const usable = c.actions.filter(actionIsUsable);
          if (claim?.usedAt) return null;                       // already had it
          if (!claim && !canClaim(c, claim)) return null;       // gone or finished
          const left = remainingClaims(c);

          return (
            <Card key={c.id} style={st.offer}>
              <Text style={st.offerKicker}>ON US</Text>
              <H1 style={{ color: '#fff' }}>{c.title}</H1>
              {!!c.blurb && <Muted style={{ color: 'rgba(255,255,255,0.75)' }}>{c.blurb}</Muted>}

              {isUnspent(claim) ? (
                <View style={{ gap: 8, marginTop: 6 }}>
                  <Body style={{ color: theme.colors.accent, fontWeight: '700' }}>Unlocked — thank you</Body>
                  <Button title="Add it to my order" style={{ backgroundColor: theme.colors.accent }} onPress={() => useOffer(c)} />
                </View>
              ) : (
                <View style={{ gap: 8, marginTop: 6 }}>
                  <Muted style={{ color: 'rgba(255,255,255,0.75)' }}>
                    {usable.length > 1 ? 'Do one of these and it’s yours:' : 'Do this and it’s yours:'}
                  </Muted>
                  {usable.map((a) => (
                    <Button key={a.id} title={a.label} style={{ backgroundColor: theme.colors.accent }} onPress={() => doAction(c, a)} />
                  ))}
                  {usable.length === 0 && <Muted style={{ color: 'rgba(255,255,255,0.75)' }}>Coming soon.</Muted>}
                  {left !== null && left < 50 && <Muted style={{ color: theme.colors.accent }}>Only {left} left</Muted>}
                </View>
              )}
            </Card>
          );
        })}

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
  offer: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand, gap: 4 },
  offerKicker: { color: theme.colors.accent, fontWeight: '800', fontSize: 11, letterSpacing: 1.5 },
  track: { height: 8, backgroundColor: theme.colors.bgMuted, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, backgroundColor: theme.colors.accent },
});
