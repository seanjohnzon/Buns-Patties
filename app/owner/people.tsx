// Who can see the staff screens. There is no separate admin account — this
// just changes a role on someone who already signed in with their phone.
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Body, Button, Card, H2, Muted, Row, Screen } from '@/components/ui';
import { findByPhone, getProfile, listTeam, setRole } from '@/lib/api';
import { formatPhone } from '@/lib/phone';
import { hasSupabase } from '@/lib/supabase';
import { theme } from '@/lib/theme';
import type { Profile, Role } from '@/lib/types';

const LABEL: Record<Role, string> = { owner: 'Owner', staff: 'Staff', customer: 'Customer' };

export default function OwnerPeople() {
  const [team, setTeam] = useState<Profile[]>([]);
  const [me, setMe] = useState<Profile | null>(null);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    listTeam().then(setTeam).catch(() => {});
    getProfile().then(setMe);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function change(p: Profile, role: Role) {
    try { await setRole(p.id, role); load(); }
    catch (e: any) { Alert.alert('Could not change that', e.message ?? String(e)); }
  }

  async function addByPhone() {
    if (!hasSupabase) { Alert.alert('Demo mode', 'Connect Supabase to add real staff.'); return; }
    setBusy(true);
    try {
      const found = await findByPhone(phone.trim());
      if (!found) { Alert.alert('Not found', 'They need to sign in to the app once first, then you can make them staff.'); return; }
      await setRole(found.id, 'staff');
      setPhone('');
      load();
    } catch (e: any) { Alert.alert('Could not add them', e.message ?? String(e)); }
    finally { setBusy(false); }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <Muted>Everyone signs in the same way, with a code by text. A role decides what they can see.</Muted>

        {team.map((p) => {
          const isMe = p.id === me?.id;
          return (
            <Card key={p.id} style={{ gap: 8 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <H2>{p.name ?? formatPhone(p.phone) ?? 'Someone'}</H2>
                  <Muted>{formatPhone(p.phone)} · {LABEL[p.role]}{isMe ? ' · you' : ''}</Muted>
                </View>
              </Row>
              {!isMe && (
                <Row style={{ gap: 8 }}>
                  <Button title="Staff" variant={p.role === 'staff' ? 'primary' : 'secondary'} style={{ flex: 1 }} onPress={() => change(p, 'staff')} />
                  <Button title="Owner" variant={p.role === 'owner' ? 'primary' : 'secondary'} style={{ flex: 1 }} onPress={() => change(p, 'owner')} />
                  <Button title="Remove" variant="secondary" style={{ flex: 1 }} onPress={() => change(p, 'customer')} />
                </Row>
              )}
              {isMe && <Muted>You cannot change your own role — that is what stops you locking yourself out.</Muted>}
            </Card>
          );
        })}

        <Card style={{ gap: 8 }}>
          <H2>Add someone</H2>
          <Muted>They sign in to the app once, then you make them staff by their number.</Muted>
          <TextInput value={phone} onChangeText={setPhone} placeholder="+1 713 555 0000" keyboardType="phone-pad" style={st.input} />
          <Button title={busy ? 'Looking…' : 'Make them staff'} disabled={busy || phone.trim().length < 8} onPress={addByPhone} />
        </Card>
      </ScrollView>
    </Screen>
  );
}

const st = StyleSheet.create({
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, padding: 12, fontSize: 16 },
});
