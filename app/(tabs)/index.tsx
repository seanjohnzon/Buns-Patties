// Home is the shop window, not the menu. Top to bottom:
//   1. The logo smashes: wind-up, slam, juice squirts, fries pop. Scrolling
//      presses it again, and every full press throws more.
//   2. Where the truck is and when it's open.
//   3. The hook: the free drink for a follow.
//   4. Whatever else the owner is running (the stamp card, new campaigns).
//   5. What people say, then "tag us", then every way to find us.
import { Link } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView as RNScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Extrapolation, interpolate, useAnimatedReaction, useAnimatedScrollHandler, useDerivedValue,
  useReducedMotion, useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { CartBar } from '@/components/CartBar';
import { FryBurst } from '@/components/FryBurst';
import { SmashHero, playIntro } from '@/components/SmashHero';
import { StampCards } from '@/components/StampCard';
import { Body, Button, H2, Muted, Row, Screen } from '@/components/ui';
import { WelcomeOffer } from '@/components/WelcomeOffer';
import { getTruckStatus } from '@/lib/api';
import { theme } from '@/lib/theme';
import type { TruckStatus } from '@/lib/types';

/** How far you scroll before the logo is fully pressed. */
const PRESS_DISTANCE = 140;
/** Least time between two throws of fries, so a jittery thumb doesn't spam them. */
const BURST_GAP_MS = 900;

export default function Home() {
  const [status, setStatus] = useState<TruckStatus | null>(null);
  const { width, height: screenH } = useWindowDimensions();
  const logo = Math.min(width - 40, 320);
  const heroH = logo + 8;

  useEffect(() => { getTruckStatus().then(setStatus).catch(() => {}); }, []);

  // Juice and fries fire together, every time the press lands.
  const [burst, setBurst] = useState(0);
  const last = useRef(0);
  const fire = useCallback(() => {
    const now = Date.now();
    if (now - last.current < BURST_GAP_MS) return;
    last.current = now;
    setBurst((b) => b + 1);
  }, []);

  const reduceMotion = useReducedMotion();
  const intro = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    playIntro(intro);
  }, [reduceMotion, intro]);

  // After the intro, the customer's thumb owns the press.
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => { scrollY.value = e.contentOffset.y; });
  const progress = useDerivedValue(() => {
    const byScroll = interpolate(scrollY.value, [0, PRESS_DISTANCE], [0, 1], Extrapolation.CLAMP);
    return byScroll > 0 ? Math.max(intro.value, byScroll) : intro.value;
  });
  useAnimatedReaction(
    () => progress.value >= 0.97,
    (hit, was) => { if (hit && !was) scheduleOnRN(fire); },
  );

  const handle = status?.instagram ? '@' + (status.instagram.split('/').filter(Boolean).pop() ?? '') : null;
  const testimonials = status?.testimonials ?? [];
  const delivery = [
    { label: 'DoorDash', url: status?.doordash },
    { label: 'Uber Eats', url: status?.ubereats },
    { label: 'Grubhub', url: status?.grubhub },
  ].filter((d) => !!d.url);
  const socials = [
    { label: 'Instagram', url: status?.instagram },
    { label: 'TikTok', url: status?.tiktok },
    { label: 'Facebook', url: status?.facebook },
  ].filter((d) => !!d.url);

  function directions() {
    if (!status) return;
    const q = status.lat && status.lng ? `${status.lat},${status.lng}` : encodeURIComponent(status.address);
    Linking.openURL(Platform.OS === 'ios' ? `http://maps.apple.com/?daddr=${q}` : `https://www.google.com/maps/dir/?api=1&destination=${q}`);
  }

  return (
    <Screen>
      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={{ paddingBottom: 110 }}>

        {/* 1. the smash */}
        <View style={[s.hero, { height: heroH }]}>
          <SmashHero progress={progress} size={logo} burst={burst} />
          {status?.halal && <View style={s.halal}><Text style={s.halalTxt}>100% HALAL</Text></View>}
        </View>

        <View style={{ paddingHorizontal: 16, gap: 18 }}>
          {/* 2. where and when */}
          <View style={s.where}>
            <Row style={{ gap: 8 }}>
              <View style={[s.dot, { backgroundColor: status?.isOpen ? '#34C759' : '#8A8A8A' }]} />
              <Text style={s.whereKicker}>{status?.isOpen ? `OPEN NOW · PICKUP IN ${status.prepMinutes} MIN` : 'CLOSED RIGHT NOW'}</Text>
            </Row>
            <Text style={s.whereName}>{status?.locationName && status.locationName !== 'TBD' ? status.locationName : 'Houston, TX'}</Text>
            {!!status?.address && status.address !== status.locationName && <Muted style={s.whereSub}>{status.address}</Muted>}
            {!!status?.hoursText && status.hoursText !== 'TBD' && <Muted style={s.whereSub}>{status.hoursText}</Muted>}
            <Row style={{ gap: 10, marginTop: 6 }}>
              <Link href="/(tabs)/menu" asChild>
                <Button title={status?.isOpen ? 'Order now' : 'See the menu'} style={s.orderBtn} />
              </Link>
              <Button title="Directions" variant="secondary" style={{ flex: 1 }} onPress={directions} />
            </Row>
          </View>

          {/* 3. the hook, 4. whatever else is running */}
          <WelcomeOffer />
          <StampCards compact />

          {/* 5. what people say */}
          {testimonials.length > 0 && (
            <View style={{ gap: 10 }}>
              <H2>What Houston's saying</H2>
              <RNScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 16 }} style={{ marginRight: -16 }}>
                {testimonials.map((r, i) => (
                  <View key={i} style={[s.review, { width: Math.min(280, width * 0.72) }]}>
                    <Text style={s.stars}>{'★'.repeat(Math.max(1, Math.min(5, r.stars)))}</Text>
                    <Body style={s.quote}>“{r.quote}”</Body>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <Muted style={{ fontWeight: '700' }}>{r.name}</Muted>
                      {r.sample ? <Text style={s.sample}>SAMPLE</Text> : <Muted>Google review</Muted>}
                    </Row>
                  </View>
                ))}
              </RNScrollView>
            </View>
          )}

          {handle && (
            <Pressable onPress={() => Linking.openURL(status!.instagram!)} style={({ pressed }) => [s.tag, pressed && { opacity: 0.85 }]}>
              <Text style={s.tagBig}>Post your burger.{'\n'}Tag {handle}</Text>
              <Muted style={{ color: 'rgba(17,17,17,0.7)' }}>We share the best ones.</Muted>
            </Pressable>
          )}

          {/* every way to find us */}
          <View style={s.footer}>
            {delivery.length > 0 && (
              <View style={{ gap: 8 }}>
                <Text style={s.footKicker}>DELIVERY</Text>
                <Row style={{ gap: 8, flexWrap: 'wrap' }}>
                  {delivery.map((d) => <FootLink key={d.label} label={d.label} onPress={() => Linking.openURL(d.url!)} />)}
                </Row>
              </View>
            )}
            {socials.length > 0 && (
              <View style={{ gap: 8 }}>
                <Text style={s.footKicker}>FOLLOW</Text>
                <Row style={{ gap: 8, flexWrap: 'wrap' }}>
                  {socials.map((d) => <FootLink key={d.label} label={d.label} onPress={() => Linking.openURL(d.url!)} />)}
                </Row>
              </View>
            )}
            {(!!status?.phone || !!status?.email) && (
              <View style={{ gap: 4 }}>
                <Text style={s.footKicker}>CONTACT</Text>
                {!!status?.phone && <Text selectable style={s.footTxt} onPress={() => Linking.openURL('tel:' + status.phone!.replace(/[^\d+]/g, ''))}>{status.phone}</Text>}
                {!!status?.email && <Text selectable style={s.footTxt} onPress={() => Linking.openURL('mailto:' + status.email)}>{status.email}</Text>}
              </View>
            )}
            <Text style={s.footSmall}>Buns & Patties · Smash burgers & fries · Houston, TX</Text>
          </View>
        </View>
      </Animated.ScrollView>

      <FryBurstLayer trigger={burst} width={width} height={screenH} originY={(heroH * 0.66) / screenH} />
      <CartBar />
    </Screen>
  );
}

/** The fries scatter over the whole screen, not just the logo. */
function FryBurstLayer({ trigger, width, height, originY }: { trigger: number; width: number; height: number; originY: number }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 10 }]}>
      <FryBurst trigger={trigger} width={width} height={height} originY={originY} />
    </View>
  );
}

function FootLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.footLink, pressed && { opacity: 0.7 }]}>
      <Text style={s.footLinkTxt}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  hero: { alignItems: 'center', justifyContent: 'center' },
  halal: { position: 'absolute', right: 16, top: 12, borderWidth: 1.5, borderColor: theme.colors.text, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  halalTxt: { fontSize: 10, fontWeight: '900', letterSpacing: 1.2, color: theme.colors.text },
  where: { backgroundColor: theme.colors.bgMuted, borderRadius: theme.radius.lg, padding: 18, gap: 4 },
  whereKicker: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, color: theme.colors.text },
  whereName: { fontSize: 24, fontWeight: '800', color: theme.colors.text, marginTop: 6, letterSpacing: -0.3 },
  whereSub: { fontSize: 15 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  orderBtn: { backgroundColor: theme.colors.brand, flex: 1 },
  review: { backgroundColor: theme.colors.bg, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: 16, gap: 10 },
  stars: { color: theme.colors.accent, fontSize: 18, letterSpacing: 2 },
  quote: { fontSize: 15, lineHeight: 21, flexGrow: 1 },
  sample: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: theme.colors.heat },
  tag: { backgroundColor: theme.colors.accent, borderRadius: theme.radius.lg, padding: 20, gap: 6 },
  tagBig: { fontSize: 26, fontWeight: '900', color: theme.colors.brand, letterSpacing: -0.5, lineHeight: 30 },
  footer: { borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 18, gap: 16, marginTop: 4 },
  footKicker: { fontSize: 11, fontWeight: '800', letterSpacing: 1.3, color: theme.colors.textMuted },
  footLink: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  footLinkTxt: { fontWeight: '700', color: theme.colors.text },
  footTxt: { fontSize: 16, color: theme.colors.text },
  footSmall: { fontSize: 12, color: theme.colors.textMuted },
});
