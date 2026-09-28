// The logo, smashed. The logo is cut into three layers (assets/brand/layers):
// the badge (wordmark, side text, HOUSTON), the fist on the press, and the
// burger. One number drives the press:
//
//   progress < 0   the press lifts (wind-up)
//   progress 0     the logo exactly as printed
//   progress 1     slammed: burger squashed and spread
//
// The juice is drawn the way the logo draws its own: red, dark outline, thick
// drips with round ends. It wells out of the patty edges as the press comes
// down, and runs down the bun on impact (`burst`), then settles.
import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing, Extrapolation, interpolate, useAnimatedProps, useAnimatedStyle, useSharedValue,
  withDelay, withSequence, withSpring, withTiming, type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';

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
      <Juice progress={progress} size={size} burst={burst} />
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
// Juice. Two things, both in the logo's own style (red fill, dark outline, a
// white highlight):
//   WELLS — liquid bulging out of each patty's edge, sized by how hard the press
//           is down. Scrolling squeezes it out and lets it back in.
//   DRIPS — on impact, juice runs down from the patty edges: a stem that grows,
//           a round bead at the end, and a drop that lets go and falls. Each
//           has its own timing, and they fade once they have run their course.

const JUICE = { fill: '#D02028', shine: 'rgba(255,255,255,0.75)', line: '#482010' };
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const JUICE_MS = 2200;

/** Where on the burger juice comes from: the two patty layers, both edges. */
const WELLS = [
  { side: 'left' as const, y: PATTY_Y[0] }, { side: 'right' as const, y: PATTY_Y[0] },
  { side: 'left' as const, y: PATTY_Y[1] }, { side: 'right' as const, y: PATTY_Y[1] },
];

type DripSpec = { x: number; y: number; len: number; w: number; delay: number; speed: number; drop: boolean };
/** x/y as fractions of the logo; len as a fraction of the logo height. */
// Short and fat, like the ones drawn on the logo: they run over the bottom bun, not past it.
const DRIPS: DripSpec[] = [
  { x: PATTY_EDGE.left + 0.018, y: PATTY_Y[0] + 0.014, len: 0.050, w: 0.034, delay: 0.00, speed: 1.0, drop: false },
  { x: PATTY_EDGE.right - 0.016, y: PATTY_Y[0] + 0.014, len: 0.042, w: 0.030, delay: 0.07, speed: 0.9, drop: false },
  { x: PATTY_EDGE.left + 0.030, y: PATTY_Y[1] + 0.016, len: 0.068, w: 0.038, delay: 0.03, speed: 0.85, drop: true },
  { x: PATTY_EDGE.right - 0.026, y: PATTY_Y[1] + 0.016, len: 0.060, w: 0.036, delay: 0.10, speed: 0.9, drop: false },
  { x: 0.445, y: PATTY_Y[1] + 0.018, len: 0.040, w: 0.028, delay: 0.16, speed: 1.1, drop: false },
  { x: 0.565, y: PATTY_Y[1] + 0.018, len: 0.075, w: 0.034, delay: 0.12, speed: 0.95, drop: true },
];

function Juice({ progress, size, burst }: { progress: SharedValue<number>; size: number; burst: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (!burst) return;
    t.value = 0;
    t.value = withTiming(1, { duration: JUICE_MS, easing: Easing.linear });
  }, [burst, t]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {WELLS.map((w, i) => <Well key={i} progress={progress} t={t} size={size} {...w} />)}
        {burst > 0 && DRIPS.map((d, i) => <Drip key={`${burst}-${i}`} progress={progress} t={t} size={size} spec={d} />)}
      </Svg>
    </View>
  );
}

/** Liquid bulging out of a patty edge, sized by the press. */
function Well({ progress, t, size, side, y }: { progress: SharedValue<number>; t: SharedValue<number>; size: number; side: 'left' | 'right'; y: number }) {
  const props = useAnimatedProps(() => {
    const p = progress.value;
    // Squeezed out by the press; on impact it surges a little past that and settles.
    const byPress = interpolate(p, [0.35, 1], [0, 1], Extrapolation.CLAMP);
    const surge = interpolate(t.value, [0, 0.08, 0.5, 1], [0, 0.35, 0.1, 0], Extrapolation.CLAMP);
    const amount = Math.min(1.2, byPress + surge);
    const edge = squashed(side === 'left' ? PATTY_EDGE.left + 0.01 : PATTY_EDGE.right - 0.01, y, p, size);
    const rx = size * 0.028 * amount;
    const ry = size * 0.013 * (0.6 + 0.4 * amount);
    return { cx: edge.x + (side === 'left' ? -rx * 0.4 : rx * 0.4), cy: edge.y, rx, ry, opacity: amount > 0.03 ? 1 : 0 };
  });
  const shine = useAnimatedProps(() => {
    const p = progress.value;
    const amount = Math.min(1.2, interpolate(p, [0.35, 1], [0, 1], Extrapolation.CLAMP) + interpolate(t.value, [0, 0.08, 0.5, 1], [0, 0.35, 0.1, 0], Extrapolation.CLAMP));
    const edge = squashed(side === 'left' ? PATTY_EDGE.left + 0.01 : PATTY_EDGE.right - 0.01, y, p, size);
    const rx = size * 0.028 * amount;
    return { cx: edge.x + (side === 'left' ? -rx * 0.55 : rx * 0.25), cy: edge.y - size * 0.005, rx: rx * 0.3, ry: size * 0.0035, opacity: amount > 0.25 ? 1 : 0 };
  });
  return (
    <>
      <AnimatedEllipse animatedProps={props} fill={JUICE.fill} stroke={JUICE.line} strokeWidth={size * 0.007} />
      <AnimatedEllipse animatedProps={shine} fill={JUICE.shine} />
    </>
  );
}

/** One run of juice: stem, bead, and the drop that lets go. */
function Drip({ progress, t, size, spec }: { progress: SharedValue<number>; t: SharedValue<number>; size: number; spec: DripSpec }) {
  const w = spec.w * size;          // where it leaves the patty
  const full = spec.len * size;
  const bead = w * 0.42;            // the round end
  const g = 900 * (size / 240);

  // 0..1 through this drip's own life, from its start until it fades.
  const local = (tv: number) => {
    'worklet';
    return Math.max(0, Math.min(1, (tv - spec.delay) / (1 - spec.delay)));
  };
  const lengthAt = (l: number) => {
    'worklet';
    // Runs out fast, slows as it hangs; lets the drop go at 0.55 and shortens a touch.
    const grow = interpolate(l, [0, 0.55 * spec.speed, 1], [0, 1, 0.82], Extrapolation.CLAMP);
    return full * Easing.out(Easing.cubic)(Math.min(1, grow));
  };

  const stem = useAnimatedProps(() => {
    const l = local(t.value);
    const L = lengthAt(l);
    const src = squashed(spec.x, spec.y, progress.value, size);
    const x = src.x, y0 = src.y - w * 0.35;   // starts inside the patty
    // Wide where it leaves the patty, narrowing to a neck, then the bead.
    const rb = Math.min(bead, L * 0.4);
    const neck = Math.max(1, rb * 1.1);
    const yn = y0 + L - rb;
    const d = `M${x - w / 2} ${y0}`
      + ` C${x - w / 2} ${y0 + L * 0.35} ${x - neck / 2} ${y0 + L * 0.5} ${x - neck / 2} ${yn}`
      + ` A${rb} ${rb} 0 1 0 ${x + neck / 2} ${yn}`
      + ` C${x + neck / 2} ${y0 + L * 0.5} ${x + w / 2} ${y0 + L * 0.35} ${x + w / 2} ${y0} Z`;
    return { d, opacity: l <= 0 ? 0 : interpolate(l, [0, 0.03, 0.82, 1], [0, 1, 1, 0], Extrapolation.CLAMP) };
  });
  const shine = useAnimatedProps(() => {
    const l = local(t.value);
    const L = lengthAt(l);
    const src = squashed(spec.x, spec.y, progress.value, size);
    const x = src.x - w * 0.16, y0 = src.y + w * 0.15;
    return {
      d: `M${x} ${y0} L${x + w * 0.04} ${y0 + Math.max(0, L * 0.5)}`,
      opacity: l <= 0 ? 0 : interpolate(l, [0, 0.05, 0.82, 1], [0, 1, 1, 0], Extrapolation.CLAMP),
    };
  });
  const drop = useAnimatedProps(() => {
    const l = local(t.value);
    const since = Math.max(0, l - 0.55) * (JUICE_MS / 1000) * (1 - spec.delay);
    const src = squashed(spec.x, spec.y, progress.value, size);
    const y = src.y + full + bead + 0.5 * g * since * since;
    return {
      cx: src.x, cy: y, r: bead * 0.7,
      opacity: !spec.drop || l < 0.55 ? 0 : interpolate(since, [0, 0.04, 0.3, 0.45], [0, 1, 1, 0], Extrapolation.CLAMP),
    };
  });

  return (
    <>
      <AnimatedPath animatedProps={stem} fill={JUICE.fill} stroke={JUICE.line} strokeWidth={size * 0.007} strokeLinejoin="round" />
      <AnimatedPath animatedProps={shine} stroke={JUICE.shine} strokeWidth={w * 0.16} strokeLinecap="round" fill="none" />
      <AnimatedCircle animatedProps={drop} fill={JUICE.fill} stroke={JUICE.line} strokeWidth={size * 0.007} />
    </>
  );
}
