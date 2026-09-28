// Gate for the staff and owner screens.
//
// This is the SECOND line of defence, not the only one. The database refuses
// owner reports and role changes to anyone without the role, whatever the app
// does — this just stops the wrong screen opening when someone follows a link,
// and stops a staff member seeing an empty money screen and thinking it broke.
import { Link, Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Body, Button, H2, Muted, Screen } from './ui';
import { getProfile } from '@/lib/api';
import type { Profile } from '@/lib/types';

type Need = 'staff' | 'owner';

export function RequireRole({ need, children }: { need: Need; children: React.ReactNode }) {
  const [state, setState] = useState<{ loading: boolean; profile: Profile | null }>({ loading: true, profile: null });

  useEffect(() => {
    let alive = true;
    getProfile()
      .then((p) => { if (alive) setState({ loading: false, profile: p }); })
      .catch(() => { if (alive) setState({ loading: false, profile: null }); });
    return () => { alive = false; };
  }, []);

  if (state.loading) return <Screen />;

  // Not signed in at all — send them to sign in rather than showing a refusal.
  if (!state.profile) return <Redirect href="/auth" />;

  const allowed = need === 'owner' ? state.profile.isOwner : state.profile.isStaff;
  if (allowed) return <>{children}</>;

  return (
    <Screen style={{ padding: 24, gap: 12, alignItems: 'center', justifyContent: 'center' }}>
      <H2>{need === 'owner' ? 'Owners only' : 'Staff only'}</H2>
      <Muted style={{ textAlign: 'center' }}>
        {need === 'owner'
          ? 'Takings and staff settings are only visible to the owner.'
          : 'This screen is for people working the truck.'}
      </Muted>
      <View style={{ height: 8 }} />
      <Link href="/(tabs)" asChild><Button title="Back to the menu" /></Link>
      <Body style={{ textAlign: 'center' }}>
        <Muted>Should you have access? Ask the owner to add your number.</Muted>
      </Body>
    </Screen>
  );
}
