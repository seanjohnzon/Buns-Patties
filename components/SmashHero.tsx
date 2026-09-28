// The logo, smashed. The logo is cut into three layers (assets/brand/layers):
// the badge (wordmark, side text, HOUSTON), the fist on the press, and the
// burger. One number drives the press:
//
//   progress < 0   the press lifts (wind-up)
//   progress 0     the logo exactly as printed
//   progress 1     slammed: burger squashed and spread
//
// The juice that squirts out on impact is not tied to progress — it is a burst
// with its own physics, fired each time `burst` goes up. Tying it to progress
// would suck the juice back into the burger when the press lifts.
import { Image } from 'expo-image';
import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing, Extrapolation, interpolate, useAnimatedStyle, useSharedValue,
  withDelay, withSequence, withSpring, withTiming, type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

const BADGE = require('@/assets/brand/layers/badge.png');
const PRESS = require('@/assets/brand/layers/press.png');
const BURGER = require('@/assets/brand/layers/burger.png');

// Where the layers sit, as fractions of the logo (measured off the 1600px original).
const PRESS_BOX = { x: 0.32, y: 0.33, w: 0.365, h: 0.184375 };
const BURGER_BOX = { x: 0.2625, y: 0.514375, w: 0.48125, h: 0.235625 };
// The two patties, where the juice comes from.
const PATTY_Y = [0.622, 0.676];
const PATTY_EDGE = { left: 0.305, right: 0.705 };

/** How hard the press squashes the burger at progress 1. */
const SQUASH = 0.24;
const SPREAD = 0.12;

// ---- the press on open ----
export const INTRO_WINDUP_MS = 200;
export const INTRO_SLAM_MS = 190;
export const INTRO_HOLD_MS = 320;
/** A beat at rest first, so the logo is seen before it is smashed. */
export const INTRO_DELAY_MS = 450;

/** Wind up, slam, hold, spring back. About a second, and never blocks anything. */
export function playIntro(progress: SharedValue<number>) {
  progress.value = withDelay(INTRO_DELAY_MS, withSequence(
    withTiming(-0.14, { duration: INTRO_WINDUP_MS, easing: Easing.out(Easing.quad) }),
    withTiming(1, { duration: INTRO_SLAM_MS, easing: Easing.in(Easing.cubic) }),
    withDelay(INTRO_HOLD_MS, withSpring(0, { damping: 13, stiffness: 160, mass: 0.8 })),
  ));
}
/** When the slam lands, for firing the juice and the fries. */
export const INTRO_IMPACT_MS = INTRO_DELAY_MS + INTRO_WINDUP_MS + INTRO_SLAM_MS;

export function SmashHero({ progress, size = 240, burst = 0 }: { progress: SharedValue<number>; size?: number; burst?: number }) {
  const bh = BURGER_BOX.h * size;

  const burgerStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const sy = p >= 0 ? 1 - SQUASH * Math.min(p, 1.05) : 1 + 0.08 * Math.min(-p, 0.3);
    const sx = p >= 0 ? 1 + SPREAD * Math.min(p, 1.05) : 1 - 0.03 * Math.min(-p, 0.3);
    return { transform: [{ scaleX: sx }, { scaleY: sy }] };
  });

  const pressStyle = useAnimatedStyle(() => {
    const p = progress.value;
    // Down: ride the top of the bun exactly. Up: lift clear for the wind-up.
    // The lift is small: the fist sits right under the wordmark.
    const y = p >= 0 ? bh * SQUASH * Math.min(p, 1.05) : Math.max(p, -0.2) * size * 0.12;
    // A hair of tilt on the way down sells the weight.
    const r = interpolate(p, [-0.14, 0, 0.6, 1], [-2.5, 0, 1, 0], Extrapolation.CLAMP);
    return { transform: [{ translateY: y }, { rotate: `${r}deg` }] };
  });

  return (
    <View style={{ width: size, height: size }}>
      <Image source={BADGE} style={StyleSheet.absoluteFill} contentFit="contain" />
      <Animated.View style={[box(BURGER_BOX, size), { transformOrigin: 'bottom' }, burgerStyle]}>
        <Image source={BURGER} style={StyleSheet.absoluteFill} contentFit="fill" />
      </Animated.View>
      <Animated.View style={[box(PRESS_BOX, size), pressStyle]}>
        <Image source={PRESS} style={StyleSheet.absoluteFill} contentFit="fill" />
      </Animated.View>
      <JuiceBurst size={size} burst={burst} />
    </View>
  );
}

function box(b: { x: number; y: number; w: number; h: number }, size: number) {
  return { position: 'absolute' as const, left: b.x * size, top: b.y * size, width: b.w * size, height: b.h * size };
}

/** Where a point on the burger ends up once it is squashed and spread. */
function squashed(fx: number, fy: number, p: number, size: number) {
  'worklet';
  const q = Math.max(0, Math.min(p, 1.05));
  const cx = (BURGER_BOX.x + BURGER_BOX.w / 2) * size;
  const bottom = (BURGER_BOX.y + BURGER_BOX.h) * size;
  return {
    x: cx + (fx * size - cx) * (1 + SPREAD * q),
    y: bottom - (bottom - fy * size) * (1 - SQUASH * q),
  };
}

// ---------------------------------------------------------------------------
// The squirt. Droplets leave both sides of the patties on impact, fly out, arc
// under gravity and stretch along the way they are travelling. Fired and
// forgotten: each `burst` is a fresh throw with new random numbers.

const JUICE = { light: '#FFD27A', mid: '#E9A23B', dark: '#A8581A', shine: 'rgba(255,255,255,0.85)' };
const DROPS = 14;
const JUICE_MS = 950;

type Throw = { x: number; y: number; vx: number; vy: number; r: number; delay: number };

function JuiceBurst({ size, burst }: { size: number; burst: number }) {
  const t = useSharedValue(0);
  const throws = useMemo<Throw[]>(() => {
    const k = size / 240;
    return Array.from({ length: DROPS }, (_, i) => {
      const left = i % 2 === 0;
      const fy = PATTY_Y[i % 4 < 2 ? 0 : 1] + (Math.random() - 0.5) * 0.02;
      // Launch from where the patty edge is when the burger is fully squashed.
      const edge = squashed(left ? PATTY_EDGE.left : PATTY_EDGE.right, fy, 1, size);
      return {
        x: edge.x, y: edge.y,
        vx: (left ? -1 : 1) * (90 + Math.random() * 190) * k,
        vy: -(40 + Math.random() * 190) * k,
        r: (3.5 + Math.random() * 5.5) * k,
        delay: Math.random() * 0.12,
      };
    });
    // A new throw every burst.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [burst, size]);

  useEffect(() => {
    if (!burst) return;
    t.value = 0;
    t.value = withTiming(1, { duration: JUICE_MS, easing: Easing.linear });
  }, [burst, t]);

  if (!burst) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {throws.map((d, i) => <Drop key={`${burst}-${i}`} t={t} d={d} size={size} />)}
    </View>
  );
}

const G = 1100; // pt/s², at size 240

function Drop({ t, d, size }: { t: SharedValue<number>; d: Throw; size: number }) {
  const g = G * (size / 240);
  const w = d.r * 2;
  const h = d.r * 3;
  const style = useAnimatedStyle(() => {
    const local = Math.max(0, t.value - d.delay) / (1 - d.delay);
    const s = local * (JUICE_MS / 1000);
    const vy = d.vy + g * s;
    const speed = Math.sqrt(d.vx * d.vx + vy * vy);
    // Point the drop's tail back along its path, and stretch it with speed.
    const angle = Math.atan2(vy, d.vx) * (180 / Math.PI) - 90;
    const stretch = 1 + Math.min(0.9, speed / (500 * (size / 240)));
    const pop = interpolate(local, [0, 0.08], [0.2, 1], Extrapolation.CLAMP);
    return {
      opacity: local <= 0 ? 0 : interpolate(local, [0, 0.05, 0.75, 1], [0, 1, 1, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: d.x + d.vx * s - w / 2 },
        { translateY: d.y + d.vy * s + 0.5 * g * s * s - h / 2 },
        { rotate: `${angle}deg` },
        { scaleY: stretch * pop },
        { scaleX: pop / Math.sqrt(stretch) },
      ],
    };
  });
  return (
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: w, height: h }, style]}>
      <JuiceDrop w={w} h={h} />
    </Animated.View>
  );
}

/** A glossy teardrop: round head at the bottom, tail at the top. */
function JuiceDrop({ w, h }: { w: number; h: number }) {
  return (
    <Svg width={w} height={h} viewBox="0 0 20 30">
      <Defs>
        <LinearGradient id="j" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={JUICE.light} />
          <Stop offset="0.55" stopColor={JUICE.mid} />
          <Stop offset="1" stopColor={JUICE.dark} />
        </LinearGradient>
      </Defs>
      <Path d="M10 0 C10 0 1 13 1 20 A9 9 0 0 0 19 20 C19 13 10 0 10 0 Z" fill="url(#j)" />
      <Circle cx="7" cy="19" r="2.6" fill={JUICE.shine} />
    </Svg>
  );
}
