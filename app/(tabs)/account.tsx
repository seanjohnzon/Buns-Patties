import { Link, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Body, Button, Card, H2, Muted, Screen } from '@/components/ui';
import { getProfile, savePushToken } from '@/lib/api';
import { registerForPush } from '@/lib/push';
import { hasSupabase, supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

export default function Account() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const router = useRouter();
  useFocusEffect(useCallback(() => {
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
            <Body>{profile.points.toLocaleString()} points</Body>
          </Card>
        ) : (
          <Card style={{ gap: 10 }}>
            <H2>Sign in to earn rewards</H2>
            <Muted>Get 100 points just for joining.</Muted>
            <Button title="Sign in with phone" onPress={() => router.push('/auth')} />
          </Card>
        )}

        {profile && (
          <Link href="/feedback" asChild><Button title="Tell the owner something" variant="secondary" /></Link>
        )}

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
