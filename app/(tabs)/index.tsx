// Home — logo, truck status (open/closed + pickup time), points card,
// "Your rewards" carousel, "Featured" carousel.
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CartBar } from '@/components/CartBar';
import { FeaturedCard } from '@/components/MenuItemRow';
import { PointsCard } from '@/components/PointsCard';
import { Body, Button, H2, Muted, Row, Screen } from '@/components/ui';
import { getMenu, getProfile, getRewards, getTruckStatus, isSoldOut } from '@/lib/api';
import { spendToGo } from '@/lib/points';
import { theme } from '@/lib/theme';
import type { MenuItem, Profile, Reward, TruckStatus } from '@/lib/types';

const LOGO = require('@/assets/brand/logo.png');

export default function Home() {
  const [status, setStatus] = useState<TruckStatus | null>(null);
  const [featured, setFeatured] = useState<MenuItem[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    getTruckStatus().then(setStatus);
    getMenu().then(({ items }) => setFeatured(items.filter((i) => i.featured && !isSoldOut(i))));
    getRewards().then(setRewards);
    getProfile().then(setProfile);
  }, []);

  const points = profile?.points ?? 0;
  const next = rewards.find((r) => r.pointsCost > points);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 100 }}>
        <Row style={{ gap: 12 }}>
          <Image source={LOGO} style={s.logo} contentFit="contain" />
          <View style={{ flex: 1 }}>
            <Text style={s.wordmark}>BUNS & PATTIES</Text>
            <Muted>Burgers & Fries · Houston</Muted>
            {status?.halal && <View style={s.halal}><Text style={s.halalTxt}>HALAL</Text></View>}
          </View>
        </Row>

        <View style={s.hero}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <H2 style={{ color: '#fff' }}>{status?.locationName ?? '…'}</H2>
              <Muted style={{ color: 'rgba(255,255,255,0.8)' }}>{status?.address}</Muted>
            </View>
            <View style={[s.dot, { backgroundColor: status?.isOpen ? theme.colors.accent : '#7A7A7A' }]} />
          </Row>
          <Body style={{ color: '#fff' }}>
            {status?.isOpen ? `Open now · pickup in ${status.prepMinutes} min` : `Closed · ${status?.hoursText ?? ''}`}
          </Body>
          <Link href="/(tabs)/menu" asChild>
            <Button title={status?.isOpen ? 'Order now' : 'See the menu'} style={{ backgroundColor: theme.colors.accent }} />
          </Link>
          {!!status?.instagram && (
            <Button title="Follow @buns.patties" variant="ghost" onPress={() => Linking.openURL(status.instagram!)} />
          )}
        </View>

        <PointsCard points={points} nextRewardAt={next?.pointsCost} nextRewardName={next?.name} />

        <View style={{ gap: 10 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <H2>Your rewards</H2>
            <Link href="/(tabs)/rewards"><Muted>More rewards ›</Muted></Link>
          </Row>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
            {rewards.map((r) => (
              <FeaturedCard key={r.id} item={{ name: r.name, imageUrl: r.imageUrl }} badge={points >= r.pointsCost ? 'Ready' : `$${spendToGo(points, r.pointsCost)} to go`} />
            ))}
          </ScrollView>
        </View>

        <View style={{ gap: 10 }}>
          <H2>Featured</H2>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
            {featured.map((i) => (
              <Link key={i.id} href={{ pathname: '/item/[id]', params: { id: i.id } }}><FeaturedCard item={i} /></Link>
            ))}
          </ScrollView>
        </View>
      </ScrollView>
      <CartBar />
    </Screen>
  );
}

const s = StyleSheet.create({
  logo: { width: 64, height: 64 },
  wordmark: { fontSize: 20, fontWeight: '800', letterSpacing: 0.5, color: theme.colors.text },
  halal: { alignSelf: 'flex-start', marginTop: 4, borderWidth: 1, borderColor: theme.colors.text, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
  halalTxt: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  hero: { backgroundColor: theme.colors.brand, borderRadius: theme.radius.lg, padding: 18, gap: 12 },
  dot: { width: 12, height: 12, borderRadius: 6 },
});
