// Sign-in. Two shapes, chosen by the build:
//
//   SIT (EXPO_PUBLIC_ENV=sit, the TestFlight test app): no texting, no code. The
//   test server has three ready logins, one per role, and one tap signs you in;
//   the session stays on the phone, so you see this screen once. Dummy data and
//   sandbox cards, so a shared password in the branch's .env is fine.
//
//   Everything else: phone OTP (Supabase Auth + Twilio), copying the reference:
//   phone → 6-digit code → done. That real flow is tried in UAT.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';
import { Body, Button, H1, Muted, Screen } from '@/components/ui';
import { phoneE164, formatPhone } from '@/lib/phone';
import { supabase } from '@/lib/supabase';
import { theme } from '@/lib/theme';

const SIT_PASSWORD = process.env.EXPO_PUBLIC_SIT_LOGIN_PASSWORD;
const SIT = process.env.EXPO_PUBLIC_ENV === 'sit' && !!SIT_PASSWORD;
const SIT_LOGINS = [
  { title: 'Owner', who: 'Serdar — every screen: orders, the kitchen board, menu and rewards settings', email: 'owner@buns.test' },
  { title: 'Customer', who: 'The app as a customer sees it: order, pay with a test card, collect stamps', email: 'customer@buns.test' },
  { title: 'Staff', who: 'The kitchen board only', email: 'staff@buns.test' },
];

export default function Auth() {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  // Supabase wants E.164. Normalise once here so the account that gets created
  // carries the same digits the owner will later search for.
  const e164 = phoneE164(phone);

  async function send() {
    if (!e164) return Alert.alert('Check that number', 'That does not look like a phone number.');
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: e164 });
    setBusy(false);
    if (error) return Alert.alert('Could not send the code', error.message);
    setSent(true);
  }
  async function verify() {
    if (!e164) return;
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ phone: e164, token: code, type: 'sms' });
    setBusy(false);
    if (error) return Alert.alert('That code did not work', error.message);
    router.back();
  }
  async function sitSignIn(email: string) {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: SIT_PASSWORD! });
    setBusy(false);
    if (error) return Alert.alert('Could not sign in', error.message);
    router.back();
  }

  if (SIT) {
    return (
      <Screen style={{ padding: 16, gap: 16 }}>
        <H1>Who are you today?</H1>
        <Muted>Test app: no code, no text. One tap, and you stay signed in.</Muted>
        {SIT_LOGINS.map((l) => (
          <View key={l.email} style={{ gap: 6 }}>
            <Button title={l.title} disabled={busy} onPress={() => sitSignIn(l.email)} />
            <Muted style={{ textAlign: 'center' }}>{l.who}</Muted>
          </View>
        ))}
        <Body style={{ textAlign: 'center', marginTop: 12 }}>To switch, sign out from Account and come back here.</Body>
      </Screen>
    );
  }

  return (
    <Screen style={{ padding: 16, gap: 16 }}>
      <H1>{sent ? 'Enter the code' : 'Your phone number'}</H1>
      <Muted>{sent ? `We texted a 6-digit code to ${formatPhone(e164)}` : 'We’ll text you a code. No password.'}</Muted>
      {!sent ? (
        <>
          <TextInput value={phone} onChangeText={setPhone} placeholder="+1 555 123 4567" keyboardType="phone-pad" autoFocus style={s.input} />
          <Button title="Send code" disabled={busy || !e164} onPress={send} />
        </>
      ) : (
        <>
          <TextInput value={code} onChangeText={setCode} placeholder="123456" keyboardType="number-pad" autoFocus maxLength={6} style={s.input} />
          <Button title="Verify" disabled={busy || code.length < 6} onPress={verify} />
          <Button title="Resend" variant="ghost" onPress={send} />
        </>
      )}
      <Body style={{ textAlign: 'center', marginTop: 12 }}>Sign in to claim your free drink and order ahead.</Body>
    </Screen>
  );
}

const s = StyleSheet.create({ input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, padding: 14, fontSize: 20 } });
