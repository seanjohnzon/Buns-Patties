// Fries, scattering. Like the emoji effect when a reaction bursts on screen:
// single seasoned fries — drawn, not the 🍟 carton — thrown out of the burger
// and popping in all over the screen, tumbling, drifting down at their own
// speeds and disappearing in their own ways. Every burst is a different throw.
import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, Extrapolation, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

const THROWN = 14;   // out of the burger
const POPPED = 14;   // appear around the screen
const MS = 2600;

const FRY = { top: '#F7CF52', side: '#E0A62E', edge: '#B9781C', shine: '#FDE59A', spice: ['#8E2A17', '#5A3218', '#C1441E'] };

type Fry = {
  kind: 'thrown' | 'popped';
  x0: number; y0: number;       // where it starts
  vx: number; vy: number;       // thrown: launch speed
  fall: number;                 // popped: how fast it drifts down
  sway: number; swayHz: number; // side-to-side wobble on the way down
  rot0: number; spin: number;
  len: number; wid: number; bend: number;
  delay: number; life: number;  // its own window inside the burst
  exit: 'fade' | 'shrink' | 'off';
  spice: { x: number; y: number; c: string }[];
};

function make(kind: Fry['kind'], width: number, height: number, ox: number, oy: number): Fry {
  const r = Math.random;
  const len = 26 + r() * 22;
  const thrown = kind === 'thrown';
  const a = (-90 + (r() - 0.5) * 300) * (Math.PI / 180);
  const v = 450 + r() * 500;
  return {
    kind,
    x0: thrown ? ox + (r() - 0.5) * width * 0.28 : r() * width,
    y0: thrown ? oy + (r() - 0.5) * height * 0.05 : r() * height * 0.7,
    vx: Math.cos(a) * v, vy: Math.sin(a) * v,
    fall: 90 + r() * 260,
    sway: 6 + r() * 26, swayHz: 0.6 + r() * 1.4,
    rot0: r() * 360, spin: (r() < 0.5 ? -1 : 1) * (60 + r() * 420),
    len, wid: 6.5 + r() * 3, bend: (r() - 0.5) * 10,
    delay: thrown ? r() * 0.08 : 0.04 + r() * 0.3,
    life: thrown ? 0.55 + r() * 0.4 : 0.45 + r() * 0.5,
    exit: (['fade', 'shrink', 'off'] as const)[Math.floor(r() * 3)],
    spice: Array.from({ length: 3 + Math.floor(r() * 3) }, () => ({ x: r(), y: r(), c: FRY.spice[Math.floor(r() * 3)] })),
  };
}

export function FryBurst({ trigger, width, height, originY = 0.62 }: { trigger: number; width: number; height: number; originY?: number }) {
  const reduce = useReducedMotion();
  const t = useSharedValue(0);

  const fries = useMemo<Fry[]>(() => [
    ...Array.from({ length: THROWN }, () => make('thrown', width, height, width / 2, height * originY)),
    ...Array.from({ length: POPPED }, () => make('popped', width, height, width / 2, height * originY)),
    // A new scatter every burst.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [trigger, width, height]);

  useEffect(() => {
    if (!trigger || reduce) return;
    t.value = 0;
    t.value = withTiming(1, { duration: MS, easing: Easing.linear });
  }, [trigger, reduce, t]);

  if (!trigger || reduce) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { width, height, overflow: 'hidden' }]}>
      {fries.map((f, i) => <FryPiece key={`${trigger}-${i}`} t={t} f={f} floor={height} />)}
    </View>
  );
}

const G = 1300;
const DRAG = 2.6;

function FryPiece({ t, f, floor }: { t: SharedValue<number>; f: Fry; floor: number }) {
  const style = useAnimatedStyle(() => {
    // Its own clock: 0 at its start, 1 at the end of its life.
    const l = Math.max(0, Math.min(1, (t.value - f.delay) / f.life));
    const s = l * f.life * (MS / 1000);
    let x: number, y: number;
    if (f.kind === 'thrown') {
      const drag = 1 - Math.exp(-DRAG * s);
      x = f.x0 + (f.vx / DRAG) * drag;
      y = f.y0 + (f.vy / DRAG) * drag + 0.5 * G * s * s * 0.5;
    } else {
      x = f.x0;
      y = f.y0 + f.fall * s + 0.5 * 260 * s * s;
    }
    x += Math.sin(s * f.swayHz * Math.PI * 2 + f.rot0) * f.sway;

    const pop = interpolate(l, [0, 0.08, 0.16], [0, 1.3, 1], Extrapolation.CLAMP);
    const gone = f.exit === 'fade'
      ? interpolate(l, [0.6, 1], [1, 0], Extrapolation.CLAMP)
      : f.exit === 'shrink' ? interpolate(l, [0.75, 0.95], [1, 0], Extrapolation.CLAMP) : 1;
    const scale = pop * (f.exit === 'shrink' ? gone : 1);
    // 'off' ones simply fall off the bottom; anything still on screen at the end fades.
    const tail = interpolate(l, [0.9, 1], [1, 0], Extrapolation.CLAMP);
    return {
      opacity: l <= 0 ? 0 : Math.min(f.exit === 'fade' ? gone : 1, y > floor ? 0 : 1, tail),
      transform: [
        { translateX: x - f.wid / 2 },
        { translateY: y - f.len / 2 },
        { rotate: `${f.rot0 + f.spin * s}deg` },
        { scale },
      ],
    };
  });
  return (
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, style]}>
      <FryStick f={f} />
    </Animated.View>
  );
}

/** One seasoned fry: a golden stick with a lit face, a darker side, and seasoning. */
function FryStick({ f }: { f: Fry }) {
  const { len, wid, bend } = f;
  return (
    <View style={{ width: wid, height: len, borderRadius: wid / 2, backgroundColor: FRY.side, borderWidth: 1, borderColor: FRY.edge, overflow: 'hidden', transform: [{ skewX: `${bend}deg` }] }}>
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: wid * 0.55, backgroundColor: FRY.top }} />
      <View style={{ position: 'absolute', left: wid * 0.12, top: 3, bottom: 6, width: 1.5, borderRadius: 1, backgroundColor: FRY.shine, opacity: 0.9 }} />
      {f.spice.map((p, i) => (
        <View key={i} style={{ position: 'absolute', left: 1 + p.x * (wid - 4), top: 2 + p.y * (len - 6), width: 1.6, height: 1.6, borderRadius: 1, backgroundColor: p.c }} />
      ))}
    </View>
  );
}
