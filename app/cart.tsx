// Cart + checkout — name for the order, pickup time, tip, then the owner's
// Square payment page (card, Apple Pay, Google Pay).
// Rewards arrive here as a line marked "on us" (the free drink, a stamp-card
// reward); only real extras on them are charged.
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Body, Button, Card, H2, Muted, Pill, Row, Screen, Stepper, money } from '@/components/ui';
import { DEMO_ALLOWED, createCheckout, demoPlaceOrder, getProfile, getTruckStatus, saveName } from '@/lib/api';
import { cartTotals, lineTotal, listTotal, useCart } from '@/lib/cart';
import { round2 } from '@/lib/pricing';
import { summarise } from '@/lib/modifiers';
import { checkoutBlock } from '@/lib/availability';
import { hasSupabase } from '@/lib/supabase';
import { theme } from '@/lib/theme';

const TIPS = [0, 0.1, 0.15, 0.2];

export default function Cart() {
  const { lines, tip, pickupAt, setQty, setTip, setPickupAt, remove, clear } = useCart();
  const [pickupName, setPickupName] = useState('');
  const [open, setOpen] = useState<boolean | null>(null);
  const [paymentsEnabled, setPaymentsEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  // Re-checked every time the cart comes into view, not just the first time:
  // the truck may have opened or shut since.
  useFocusEffect(useCallback(() => {
    getProfile().then((p) => { if (p?.name) setPickupName((n) => n || p.name!); }).catch(() => {});
    getTruckStatus().then((s) => { setOpen(s.isOpen); setPaymentsEnabled(s.paymentsEnabled ?? false); }).catch(() => setOpen(null));
  }, []));

  const t = cartTotals(lines, tip);
  const gate = checkoutBlock({ open, paymentsEnabled, total: t.total, name: pickupName });

  async function pay() {
    const block = checkoutBlock({ open, paymentsEnabled, total: t.total, name: pickupName });
    if (block.blocked) { Alert.alert(block.reason === 'closed' ? 'Closed right now' : 'Almost there', block.message); return; }
    if (!hasSupabase) {
      // Test build: no card, no server — the order goes into the test database on
      // the phone, so the rest of the flow (order screen, kitchen board, stamps,
      // the owner's numbers) can be walked in Expo Go or the TestFlight test app.
      if (!DEMO_ALLOWED) return;
      try {
        const id = await demoPlaceOrder({
          lines: lines.map((l) => ({
            menuItemId: l.item.id, name: l.item.name, qty: l.qty,
            price: round2(lineTotal(l) / l.qty), listPrice: round2(listTotal(l) / l.qty),
            mods: l.chosen.map((o) => o.name), note: l.note, claim: l.claim,
          })),
          subtotal: t.subtotal, tax: t.tax, tip: t.tip, total: t.total, saved: t.saved,
          pickupName: pickupName.trim(), pickupAt,
        });
        clear();
        router.replace({ pathname: '/order/[id]', params: { id } });
      } catch (e: any) { Alert.alert('Could not place that', e.message ?? String(e)); }
      return;
    }

    // No prices are sent: the server looks up every one and decides for itself
    // whether a claimed freebie is real.
    const payload = {
      lines: lines.map((l) => ({
        menuItemId: l.item.id, name: l.item.name, qty: l.qty,
        mods: l.chosen.map((o) => o.name), note: l.note,
        campaign: l.claim?.campaign, tier: l.claim?.tier,
      })),
      tip: t.tip, pickupAt, pickupName: pickupName.trim(),
    };

    setBusy(true);
    try {
      await saveName(pickupName);

      const res = await createCheckout(payload);
      clear();
      const toOrder = () => router.replace({ pathname: '/order/[id]', params: { id: res.orderId } });
      // Nothing to pay (the free drink on its own) — straight to the order.
      if (res.free || !res.checkoutUrl) { toOrder(); return; }

      // Square hosts the payment page. On the web we go there and Square sends
      // them back to the order screen; in the app it opens over the top, and the
      // order screen underneath flips to "received" the moment Square tells us.
      if (Platform.OS === 'web') { await Linking.openURL(res.checkoutUrl); return; }
      toOrder();
      await WebBrowser.openBrowserAsync(res.checkoutUrl, { dismissButtonStyle: 'close' });
    } catch (e: any) {
      Alert.alert('Error', e.message ?? String(e));
    } finally { setBusy(false); }
  }

  if (lines.length === 0) {
    return <Screen style={{ alignItems: 'center', justifyContent: 'center' }}><Muted>Your order is empty.</Muted></Screen>;
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 140 }}>
        <View style={{ gap: 12 }}>
          {lines.map((l) => (
            <Row key={l.key} style={{ justifyContent: 'space-between', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Body style={{ fontWeight: '600' }}>{l.item.name}</Body>
                {l.chosen.length > 0 && <Muted>{summarise(l.chosen)}</Muted>}
                {!!l.note && <Muted>“{l.note}”</Muted>}
              </View>
              {l.claim ? <Button title="Remove" variant="ghost" onPress={() => remove(l.key)} style={{ paddingHorizontal: 8, paddingVertical: 6 }} /> : <Stepper qty={l.qty} onChange={(q) => setQty(l.key, q)} />}
              <Body style={{ minWidth: 60, textAlign: 'right' }}>{money(lineTotal(l))}</Body>
            </Row>
          ))}
        </View>

        <Card style={{ gap: 10 }}>
          <H2>Pickup</H2>
          <Row style={{ gap: 8 }}>
            <Pill label="ASAP" active={!pickupAt} onPress={() => setPickupAt(null)} />
            <Pill label="Schedule" active={!!pickupAt} onPress={() => setPickupAt(new Date(Date.now() + 30 * 60000).toISOString())} />
          </Row>
          <Muted>{pickupAt ? `At ${new Date(pickupAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Ready in about 15 min'}</Muted>
        </Card>

        <Card style={{ gap: 10 }}>
          <H2>Tip</H2>
          <Row style={{ gap: 8 }}>
            {TIPS.map((p) => <Pill key={p} label={p === 0 ? 'None' : `${p * 100}%`} active={tip === +(t.subtotal * p).toFixed(2)} onPress={() => setTip(+(t.subtotal * p).toFixed(2))} />)}
          </Row>
        </Card>

        <Card style={{ gap: 8 }}>
          <H2>Name for the order</H2>
          <Muted>We'll call this out at the window. No code to show.</Muted>
          <TextInput
            value={pickupName}
            onChangeText={setPickupName}
            placeholder="First name"
            autoCapitalize="words"
            style={s.nameInput}
          />
        </Card>

        <View style={{ gap: 6 }}>
          <Line label="Subtotal" v={t.subtotal} />
          {t.saved > 0 && <Muted>On us today: {money(t.saved)}</Muted>}
          {t.tax > 0 && <Line label="Tax" v={t.tax} />}
          {t.tip > 0 && <Line label="Tip" v={t.tip} />}
          <Line label="Total" v={t.total} bold />
        </View>
      </ScrollView>
      <View style={s.footer}>
        {gate.blocked && gate.reason !== 'no_name' && <Muted style={{ textAlign: 'center', marginBottom: 8 }}>{gate.message}</Muted>}
        <Button
          title={gate.blocked && gate.reason === 'closed' ? 'Closed right now'
            : gate.blocked && gate.reason === 'payments_off' ? 'Pay at the window for now'
            : busy ? 'Processing…' : t.total === 0 ? 'Place order — nothing to pay' : `Pay ${money(t.total)}`}
          disabled={busy || (gate.blocked && gate.reason !== 'no_name')}
          onPress={pay}
        />
      </View>
    </Screen>
  );
}

function Line({ label, v, bold }: { label: string; v: number; bold?: boolean }) {
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <Body style={bold && { fontWeight: '700', fontSize: 18 }}>{label}</Body>
      <Body style={bold && { fontWeight: '700', fontSize: 18 }}>{money(v)}</Body>
    </Row>
  );
}

const s = StyleSheet.create({
  nameInput: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, padding: 11, fontSize: 16 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 32, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: theme.colors.border },
});
