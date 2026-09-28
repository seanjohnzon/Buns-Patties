// Home. The logo presses once when the app opens, then the customer's scroll
// presses it again — and the first thing that scroll reveals is the free drink.
// After that: is the truck open, how far to the next free thing, what's featured.
import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View, ScrollView as RNScrollView } from 'react-native';
import Animated, {
  Easing, Extrapolation, interpolate, useAnimatedScrollHandler, useDerivedValue,
  useReducedMotion, useSharedValue, withSequence, withTiming,
} from 'react-native-reanimated';
import { CartBar } from '@/components/CartBar';
import { FeaturedCard } from '@/components/MenuItemRow';
import { PointsCard } from '@/components/PointsCard';
import { SmashHero } from '@/components/SmashHero';
import { Body, Button, H2, Muted, Row, Screen } from '@/components/ui';
import { WelcomeOffer } from '@/components/WelcomeOffer';
import { getMenu, getProfile, getRewards, getTruckStatus, isSoldOut } from '@/lib/api';
import { spendToGo } from '@/lib/points';
import { theme } from '@/lib/theme';
import type { MenuItem, Profile, Reward, TruckStatus } from '@/lib/types';

/** How far you scroll before the logo is fully pressed. */
const PRESS_DISTANCE = 140;

export default function Home() {
  const [status, setStatus] = useState<TruckStatus | null>(null);
  const [featured, setFeatured] = useState<MenuItem[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    getTruckStatus().then(setStatus).catch(() => {});
    getMenu().then(({ items }) => setFeatured(items.filter((i) => i.featured && !isSoldOut(i)))).catch(() => {});
    getRewards().then(setRewards).catch(() => {});
    getProfile().then(setProfile).catch(() => {});
  }, []);

  // One press on open — under a second, never blocking anything — then release.
  const reduceMotion = useReducedMotion();
  const intro = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    intro.value = withSequence(
      withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }),
      withTiming(0, { duration: 480, easing: Easing.inOut(Easing.quad) }),
    );
  }, [reduceMotion, intro]);

  // Then the scroll owns it.
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => { scrollY.value = e.contentOffset.y; });
  const progress = useDerivedValue(() => {
    const byScroll = interpolate(scrollY.value, [0, PRESS_DISTANCE], [0, 1], Extrapolation.CLAMP);
    return Math.max(intro.value, byScroll);
  });

  const points = profile?.points ?? 0;
  const next = rewards.find((r) => r.pointsCost > points);

  return (
    <Screen>
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: 100 }}>

        <View style={s.top}>
          <SmashHero progress={progress} size={220} />
          <Text style={s.wordmark}>BUNS & PATTIES</Text>
          <Row style={{ gap: 8 }}>
            <Muted>Burgers & Fries · Houston</Muted>
            {status?.halal && <View style={s.halal}><Text style={s.halalTxt}>HALAL</Text></View>}
          </Row>
          <Muted style={{ marginTop: 6 }}>Scroll ↓</Muted>
        </View>

        <View style={{ padding: 16, gap: 20 }}>
          <WelcomeOffer />

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
            <RNScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
              {rewards.map((r) => (
                <FeaturedCard key={r.id} item={{ name: r.name, imageUrl: r.imageUrl }} badge={points >= r.pointsCost ? 'Ready' : `$${spendToGo(points, r.pointsCost)} to go`} />
              ))}
            </RNScrollView>
          </View>

          <View style={{ gap: 10 }}>
            <H2>Featured</H2>
            <RNScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
              {featured.map((i) => (
                <Link key={i.id} href={{ pathname: '/item/[id]', params: { id: i.id } }}><FeaturedCard item={i} /></Link>
              ))}
            </RNScrollView>
          </View>
        </View>
      </Animated.ScrollView>
      <CartBar />
    </Screen>
  );
}

const s = StyleSheet.create({
  top: { alignItems: 'center', paddingTop: 8, paddingBottom: 4, gap: 4 },
  wordmark: { fontSize: 22, fontWeight: '800', letterSpacing: 0.5, color: theme.colors.text, marginTop: -18 },
  halal: { borderWidth: 1, borderColor: theme.colors.text, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
  halalTxt: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  hero: { backgroundColor: theme.colors.brand, borderRadius: theme.radius.lg, padding: 18, gap: 12 },
  dot: { width: 12, height: 12, borderRadius: 6 },
});
