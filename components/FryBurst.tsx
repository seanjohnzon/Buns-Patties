// Fries, popping. Like the emoji burst when you send a reaction: a handful of
// 🍟 jump out of the burger, scatter in every direction with a spin, hang for a
// beat and fall away. Every time `trigger` goes up, a new throw.
import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, Extrapolation, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

const FRIES = 13;
const MS = 1500;

type Fry = { ox: number; oy: number; vx: number; vy: number; spin: number; rot0: number; size: number; delay: number };

export function FryBurst({ trigger, width, height, originY = 0.62 }: { trigger: number; width: number; height: number; originY?: number }) {
  const reduce = useReducedMotion();
  const t = useSharedValue(0);

  const fries = useMemo<Fry[]>(() => Array.from({ length: FRIES }, (_, i) => {
    // Spread around a fan pointing up, a few thrown almost sideways.
    const a = (-90 + (i / (FRIES - 1) - 0.5) * 210 + (Math.random() - 0.5) * 24) * (Math.PI / 180);
    const v = 520 + Math.random() * 420;
    return {
      // Each one starts somewhere on the burger, not all from one point.
      ox: (Math.random() - 0.5) * width * 0.3,
      oy: (Math.random() - 0.5) * height * 0.08,
      vx: Math.cos(a) * v * (width / 400),
      vy: Math.sin(a) * v,
      spin: (Math.random() < 0.5 ? -1 : 1) * (240 + Math.random() * 520),
      rot0: Math.random() * 360,
      size: 24 + Math.random() * 14,
      delay: Math.random() * 0.1,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [trigger, width, height]);

  useEffect(() => {
    if (!trigger || reduce) return;
    t.value = 0;
    t.value = withTiming(1, { duration: MS, easing: Easing.linear });
  }, [trigger, reduce, t]);

  if (!trigger || reduce) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { width, height }]}>
      {fries.map((f, i) => <FryPiece key={`${trigger}-${i}`} t={t} f={f} x={width / 2} y={height * originY} />)}
    </View>
  );
}

const G = 1250;

function FryPiece({ t, f, x, y }: { t: SharedValue<number>; f: Fry; x: number; y: number }) {
  const style = useAnimatedStyle(() => {
    const local = Math.max(0, t.value - f.delay) / (1 - f.delay);
    const s = local * (MS / 1000);
    // Air drag on the way up so they hang at the top of the arc before falling.
    const drag = 1 - Math.exp(-2.4 * s);
    const px = x + f.ox + (f.vx / 2.4) * drag;
    const py = y + f.oy + (f.vy / 2.4) * drag + 0.5 * G * s * s * 0.6;
    const pop = interpolate(local, [0, 0.07, 0.14], [0, 1.35, 1], Extrapolation.CLAMP);
    return {
      opacity: interpolate(local, [0, 0.03, 0.72, 1], [0, 1, 1, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: px - f.size / 2 },
        { translateY: py - f.size / 2 },
        { rotate: `${f.rot0 + f.spin * s}deg` },
        { scale: pop },
      ],
    };
  });
  return (
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, style]}>
      <Text style={{ fontSize: f.size, lineHeight: f.size * 1.15 }}>🍟</Text>
    </Animated.View>
  );
}
