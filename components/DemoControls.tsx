// Test builds only (never with a real database): puts the test account in a
// known state so each check on the Gate 1 checklist starts from the same place.
// Everything lives in the test database on this phone (lib/local).
import { Alert, View } from 'react-native';
import { Button, Card, H2, Muted, Row } from '@/components/ui';
import { DEMO_ALLOWED, demoSet } from '@/lib/api';
import { hasSupabase } from '@/lib/supabase';

export function DemoControls({ onChange }: { onChange?: () => void }) {
  if (!DEMO_ALLOWED || hasSupabase) return null;
  const set = (s: Parameters<typeof demoSet>[0], msg: string) => { demoSet(s); onChange?.(); Alert.alert('Test account', msg); };
  return (
    <Card style={{ gap: 8, borderStyle: 'dashed' }}>
      <H2>Test controls</H2>
      <Muted>Only in test builds. Everything here is saved on this phone only.</Muted>
      <Muted>Stamps on the card:</Muted>
      <Row style={{ gap: 6, flexWrap: 'wrap' }}>
        {[0, 4, 5, 9, 10].map((n) => (
          <View key={n} style={{ minWidth: 56 }}>
            <Button title={String(n)} variant="secondary" onPress={() => set({ stamps: n }, `Stamp card set to ${n}.`)} style={{ paddingVertical: 8 }} />
          </View>
        ))}
      </Row>
      <Button title="Reset the free drink (as a new customer)" variant="secondary" onPress={() => set({ resetOffers: true }, 'Free drink is claimable again.')} />
      <Button title="Wipe all test data" variant="ghost" onPress={() => set({ wipe: true }, 'Test data wiped: no orders, no stamps, menu all back on, truck closed.')} />
    </Card>
  );
}
