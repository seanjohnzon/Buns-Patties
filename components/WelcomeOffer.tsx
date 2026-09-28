// The free drink, and any other "do this, get that" offer the owner is running.
// One component so the Home hook and the Rewards tab can never show different
// rules. Stamp cards are components/StampCard.tsx.
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { MIN_AWAY_MS, useLeftTheApp } from '@/components/useLeftTheApp';
import { Body, Button, Card, H1, Muted } from '@/components/ui';
import { claimCampaign, getCampaigns, getMyCampaignClaims } from '@/lib/api';
import { actionIsUsable, canClaim, isUnspent, remainingClaims, type Campaign, type CampaignAction, type CampaignClaim } from '@/lib/campaigns';
import { theme } from '@/lib/theme';

export function WelcomeOffer({ onEmpty }: { onEmpty?: () => void } = {}) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [claims, setClaims] = useState<CampaignClaim[]>([]);
  const router = useRouter();
  const pending = useRef<{ campaignId: string; actionId: string } | null>(null);

  const load = useCallback(() => {
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

  // They pick which drink (or which of the items) — it opens like any item, priced at nothing.
  function useOffer(c: Campaign) {
    if (c.rewardItemIds.length === 1) {
      router.push({ pathname: '/item/[id]', params: { id: c.rewardItemIds[0], claim: c.id } });
    } else if (c.rewardItemIds.length > 1) {
      router.push({ pathname: '/reward', params: { campaign: c.id } });
    }
  }

  const live = campaigns.filter((c) => c.kind === 'action').filter((c) => {
    const claim = claims.find((x) => x.campaignId === c.id);
    if (claim?.usedAt) return false;
    if (!claim && !canClaim(c, claim)) return false;
    return true;
  });
  if (live.length === 0) { onEmpty?.(); return null; }

  return (
    <>
      {live.map((c) => {
        const claim = claims.find((x) => x.campaignId === c.id);
        const usable = c.actions.filter(actionIsUsable);
        const left = remainingClaims(c);
        return (
          <Card key={c.id} style={st.offer}>
            <Text style={st.kicker}>ON US</Text>
            <H1 style={{ color: '#fff' }}>{c.title}</H1>
            {!!c.blurb && <Muted style={{ color: 'rgba(255,255,255,0.75)' }}>{c.blurb}</Muted>}
            {isUnspent(claim) ? (
              <View style={{ gap: 8, marginTop: 6 }}>
                <Body style={{ color: theme.colors.accent, fontWeight: '700' }}>Unlocked — thank you</Body>
                <Button title={c.rewardItemIds[0] === 'can_drink' ? 'Pick your drink' : 'Pick yours'} style={st.cta} onPress={() => useOffer(c)} />
              </View>
            ) : (
              <View style={{ gap: 8, marginTop: 6 }}>
                <Muted style={{ color: 'rgba(255,255,255,0.75)' }}>
                  {usable.length > 1 ? 'Do one of these and it’s yours:' : 'Do this and it’s yours:'}
                </Muted>
                {usable.map((a) => (
                  <Button key={a.id} title={a.label} style={st.cta} onPress={() => doAction(c, a)} />
                ))}
                {usable.length === 0 && <Muted style={{ color: 'rgba(255,255,255,0.75)' }}>Coming soon.</Muted>}
                {left !== null && left < 50 && <Muted style={{ color: theme.colors.accent }}>Only {left} left</Muted>}
              </View>
            )}
          </Card>
        );
      })}
    </>
  );
}

const st = StyleSheet.create({
  offer: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand, gap: 4, padding: 18, borderRadius: theme.radius.lg },
  cta: { backgroundColor: theme.colors.accent },
  kicker: { color: theme.colors.accent, fontWeight: '800', fontSize: 11, letterSpacing: 1.5 },
});
