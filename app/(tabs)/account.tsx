// Account: who you are, the truck's story, and how to reach the owner. Staff and
// owner tools appear below for people with those roles.
import { Link, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Body, Button, Card, H2, Muted, Screen } from '@/components/ui';
import { getProfile, getTruckStatus, savePushToken } from '@/lib/api';
import { registerForPush } from '@/lib/push';
import { hasSupabase, supabase } from '@/lib/supabase';
import { theme } from '@/lib/theme';
import type { Profile, TruckStatus } from '@/lib/types';

export default function Account() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [truck, setTruck] = useState<TruckStatus | null>(null);
  const router = useRouter();
  useFocusEffect(useCallback(() => {
    getTruckStatus().then(setTruck).catch(() => {});
    getProfile().then((p) => {
      setProfile(p);
      // Ask once we know who they are, so the prompt has a reason behind it.
      if (p) registerForPush(savePushToken);
    });
  }, []));

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        {profile ? (
          <Card style={{ gap: 4 }}>
            <H2>{profile.name ?? 'Welcome'}</H2>
            <Muted>{profile.phone ?? (hasSupabase ? '' : 'Demo mode — Supabase not configured')}</Muted>
          </Card>
        ) : (
          <Card style={{ gap: 10 }}>
            <H2>Sign in to earn rewards</H2>
            <Muted>Claim your free drink and order ahead.</Muted>
            <Button title="Sign in with phone" onPress={() => router.push('/auth')} />
          </Card>
        )}

        {!!truck?.story && (
          <Card style={{ gap: 8 }}>
            <Text style={st.kicker}>OUR STORY</Text>
            <Body style={{ lineHeight: 23 }}>{truck.story}</Body>
          </Card>
        )}

        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {!!truck?.phone && (
            <ContactRow label="Call or text us" value={truck.phone} onPress={() => Linking.openURL('tel:' + truck.phone!.replace(/[^\d+]/g, ''))} />
          )}
          {!!truck?.email && (
            <ContactRow label="Email us" value={truck.email} onPress={() => Linking.openURL('mailto:' + truck.email)} />
          )}
          {!!truck?.instagram && (
            <ContactRow label="Message us on Instagram" value={'@' + (truck.instagram.split('/').filter(Boolean).pop() ?? '')} onPress={() => Linking.openURL(truck.instagram!)} />
          )}
          <ContactRow label="Leave feedback on the app" value="Goes straight to the owner" onPress={() => router.push(profile ? '/feedback' : '/auth')} last />
        </Card>

        {profile?.isOwner && (
          <View style={{ gap: 8 }}>
            <H2>Owner</H2>
            <Link href="/owner" asChild><Button title="How the truck is doing" /></Link>
          </View>
        )}

        {profile?.isStaff && (
          <View style={{ gap: 8 }}>
            <H2>Staff</H2>
            <Link href="/staff/status" asChild><Button title="Open / close the truck" variant="secondary" /></Link>
            <Link href="/staff" asChild><Button title="Kitchen board" variant="secondary" /></Link>
            <Link href="/owner/menu" asChild><Button title="Mark items sold out" variant="secondary" /></Link>
          </View>
        )}

        {profile && hasSupabase && (
          <Button title="Sign out" variant="ghost" onPress={async () => { await supabase.auth.signOut(); setProfile(null); }} />
        )}
      </ScrollView>
    </Screen>
  );
}

function ContactRow({ label, value, onPress, last }: { label: string; value: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.row, !last && st.rowLine, pressed && { opacity: 0.6 }]}>
      <View style={{ flex: 1 }}>
        <Body style={{ fontWeight: '600' }}>{label}</Body>
        <Muted selectable>{value}</Muted>
      </View>
      <Text style={st.chev}>›</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5, color: theme.colors.textMuted },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 10 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  chev: { fontSize: 24, color: theme.colors.textMuted },
});
