// Rewards: two things, nothing else. The free drink for following us, and the
// stamp card. No points, no balance, no maths. Anything new the owner runs shows
// up here on its own.
import { Link } from 'expo-router';
import { ScrollView } from 'react-native';
import { StampCards } from '@/components/StampCard';
import { Button, Screen } from '@/components/ui';
import { WelcomeOffer } from '@/components/WelcomeOffer';

export default function Rewards() {
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <WelcomeOffer />
        <StampCards />
        <Link href="/(tabs)/menu" asChild><Button title="Order something" variant="secondary" /></Link>
      </ScrollView>
    </Screen>
  );
}
