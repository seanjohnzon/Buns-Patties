// Staff: flip the truck open/closed and say where it is parked today.
// This is what drives the Home screen banner customers see.
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { Body, Button, Card, H2, Muted, Row, Screen } from '@/components/ui';
import { getTruckStatus, setTruckStatus } from '@/lib/api';
import { theme } from '@/lib/theme';
import type { TruckStatus } from '@/lib/types';

export default function StaffStatus() {
  const [s, setS] = useState<TruckStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { getTruckStatus().then(setS); }, []);
  if (!s) return <Screen />;
  const set = (patch: Partial<TruckStatus>) => setS({ ...s, ...patch });

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <View>
              <H2>{s.isOpen ? 'Open' : 'Closed'}</H2>
              <Muted>{s.isOpen ? 'Customers can order now' : 'Ordering is turned off'}</Muted>
            </View>
            <Switch value={s.isOpen} onValueChange={(v) => set({ isOpen: v })} trackColor={{ true: theme.colors.accent }} />
          </Row>
        </Card>

        <Card style={{ gap: 10 }}>
          <H2>Where are you parked?</H2>
          <TextInput value={s.locationName} onChangeText={(v) => set({ locationName: v })} placeholder="e.g. Hillcroft & Harwin" style={st.input} />
          <TextInput value={s.address} onChangeText={(v) => set({ address: v })} placeholder="Street address" style={st.input} />
          <TextInput value={s.hoursText} onChangeText={(v) => set({ hoursText: v })} placeholder="e.g. 5pm – 1am" style={st.input} />
        </Card>

        <Card style={{ gap: 10 }}>
          <H2>Pickup wait</H2>
          <Row style={{ gap: 8 }}>
            {[10, 15, 20, 30].map((m) => (
              <Button key={m} title={`${m} min`} variant={s.prepMinutes === m ? 'primary' : 'secondary'} onPress={() => set({ prepMinutes: m })} style={{ flex: 1, paddingHorizontal: 4 }} />
            ))}
          </Row>
          <Muted>Shown to customers as “pickup in {s.prepMinutes} min”.</Muted>
        </Card>

        <Button
          title={busy ? 'Saving…' : 'Save'}
          disabled={busy}
          onPress={async () => {
            setBusy(true);
            try { await setTruckStatus(s); Alert.alert('Saved', 'Customers see this now.'); }
            catch (e: any) { Alert.alert('Error', e.message ?? String(e)); }
            finally { setBusy(false); }
          }}
        />
        <Body style={{ textAlign: 'center' }}>
          <Muted>Demo mode keeps this on the phone only until Supabase is connected.</Muted>
        </Body>
      </ScrollView>
    </Screen>
  );
}

const st = StyleSheet.create({
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, padding: 12, fontSize: 16 },
});
