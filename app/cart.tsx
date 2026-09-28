// Cart + checkout — name for the order, pickup time, tip, Stripe PaymentSheet.
// Rewards arrive here as a $0 line from the Rewards screen; there is no points
// arithmetic on this screen, deliberately.
import { useStripe } from '@/lib/stripe';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Body, Button, Card, H2, Muted, Pill, Row, Screen, Stepper, money } from '@/components/ui';
import { createCheckoutSession, createOrder, getProfile, getTruckStatus, saveName } from '@/lib/api';
import { cartTotals, lineTotal, useCart } from '@/lib/cart';
import { pointsForOrder } from '@/lib/points';
import { hasSupabase } from '@/lib/supabase';
import { theme } from '@/lib/theme';

const TIPS = [0, 0.1, 0.15, 0.2];

export default function Cart() {
  const { lines, tip, redeemPoints, pickupAt, setQty, setTip, setRedeemPoints, setPickupAt, clear } = useCart();
  const [points, setPoints] = useState(0);
  const [pickupName, setPickupName] = useState('');
  const [open, setOpen] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const stripe = useStripe();

  useEffect(() => {
    getProfile().then((p) => { setPoints(p?.points ?? 0); if (p?.name) setPickupName(p.name); }).catch(() => {});
    // Re-checked every time the cart opens: the truck may have shut since.
    getTruckStatus().then((s) => setOpen(s.isOpen)).catch(() => setOpen(null));
  }, []);

  const t = cartTotals(lines, tip, redeemPoints);

  async function pay() {
    if (open === false) { Alert.alert('Closed right now', 'The truck is shut. Your order is saved — come back when it opens.'); return; }
    if (!pickupName.trim()) { Alert.alert('Almost there', 'Add a name so we can call your order out.'); return; }
    if (!hasSupabase) { Alert.alert('Demo mode', 'Connect Supabase + Stripe to take real payments (see README).'); return; }

    // No prices are sent: the server looks up every one and decides for itself
    // whether a claimed freebie is real.
    const payload = {
      lines: lines.map((l) => ({
        menuItemId: l.item.id, name: l.item.name, qty: l.qty,
        mods: l.chosen.map((o) => o.name), note: l.note,
        campaign: l.claim?.campaign, reward: l.claim?.reward,
      })),
      tip: t.tip, pickupAt, pickupName: pickupName.trim(),
    };

    setBusy(true);
    try {
      await saveName(pickupName);

      // Web has no native payment sheet, so Stripe hosts the payment page and
      // sends them back to the order screen. Same order, same rules, same webhook.
      if (Platform.OS === 'web') {
        const { checkoutUrl } = await createCheckoutSession(payload);
        clear();
        await Linking.openURL(checkoutUrl);
        return;
      }

      if (!stripe) { Alert.alert('Payments unavailable', 'This build cannot take card payments.'); return; }
      const res = await createOrder(payload);
      const init = await stripe.initPaymentSheet({
        merchantDisplayName: 'Buns & Patties',
        paymentIntentClientSecret: res.paymentIntentClientSecret,
        customerId: res.customerId, customerEphemeralKeySecret: res.ephemeralKey,
        applePay: { merchantCountryCode: 'US' },
        googlePay: { merchantCountryCode: 'US', testEnv: true },
        allowsDelayedPaymentMethods: false,
      });
      if (init.error) throw new Error(init.error.message);
      const { error } = await stripe.presentPaymentSheet();
      if (error) { if (error.code !== 'Canceled') Alert.alert('Payment failed', error.message); return; }
      clear();
      router.replace({ pathname: '/order/[id]', params: { id: res.orderId } });
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
                {l.chosen.length > 0 && <Muted>{l.chosen.map((o) => o.name).join(', ')}</Muted>}
                {!!l.note && <Muted>“{l.note}”</Muted>}
              </View>
              {l.claim ? <Muted>Free</Muted> : <Stepper qty={l.qty} onChange={(q) => setQty(l.key, q)} />}
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
          {t.discount > 0 && <Line label="Reward" v={-t.discount} />}
          {t.tax > 0 && <Line label="Tax" v={t.tax} />}
          {t.tip > 0 && <Line label="Tip" v={t.tip} />}
          <Line label="Total" v={t.total} bold />
        </View>
      </ScrollView>
      <View style={s.footer}>
        {open === false && <Muted style={{ textAlign: 'center', marginBottom: 8 }}>The truck is closed right now.</Muted>}
        <Button
          title={open === false ? 'Closed right now' : busy ? 'Processing…' : `Pay ${money(t.total)}`}
          disabled={busy || open === false}
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
