// The customer's side of UAT. Asked once, answered in a tap, with room to type
// if they want to. Reached from the order screen after pickup and from Account.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';
import { Body, Button, H1, Muted, Row, Screen } from '@/components/ui';
import { sendFeedback } from '@/lib/api';
import { RATINGS } from '@/lib/feedback';
import { hasSupabase } from '@/lib/supabase';
import { theme } from '@/lib/theme';

export default function Feedback() {
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit() {
    setBusy(true);
    try {
      if (!hasSupabase) { Alert.alert('Thanks', 'Saved locally — connect Supabase to collect this for real.'); router.back(); return; }
      await sendFeedback({ rating, message, orderId: orderId ?? null });
      Alert.alert('Thank you', 'That goes straight to the owner.');
      router.back();
    } catch (e: any) {
      Alert.alert('Could not send that', e.message ?? String(e));
    } finally { setBusy(false); }
  }

  return (
    <Screen>
      <View style={{ padding: 16, gap: 16 }}>
        <View>
          <H1>How was it?</H1>
          <Muted>The owner reads these himself.</Muted>
        </View>

        <View style={{ gap: 8 }}>
          {RATINGS.map((r) => (
            <Button
              key={r.value}
              title={r.label}
              variant={rating === r.value ? 'primary' : 'secondary'}
              onPress={() => setRating(rating === r.value ? null : r.value)}
            />
          ))}
        </View>

        <View style={{ gap: 6 }}>
          <Body style={{ fontWeight: '600' }}>Anything else? (optional)</Body>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="What went well, or what didn't"
            multiline
            numberOfLines={4}
            style={st.input}
          />
        </View>

        <Button
          title={busy ? 'Sending…' : 'Send'}
          disabled={busy || (rating === null && message.trim().length === 0)}
          onPress={submit}
        />
        <Row style={{ justifyContent: 'center' }}>
          <Muted>We only use this to fix the app.</Muted>
        </Row>
      </View>
    </Screen>
  );
}

const st = StyleSheet.create({
  input: {
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12,
    padding: 12, fontSize: 16, minHeight: 100, textAlignVertical: 'top',
  },
});
