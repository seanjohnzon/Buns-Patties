// The logo, pressed. One drawing driven by one number: progress 0 is the logo at
// rest, 1 is fully smashed with the juice out. Home plays it once on open and
// then hands the same value to the scroll position, so the customer's thumb
// finishes what the app started.
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { theme } from '@/lib/theme';

const LOGO = require('@/assets/brand/logo.png');

// Where each drop starts under the patty (as a fraction of the logo width), how
// far it falls, and the slice of the press it lives in.
const DROPS = [
  { x: 0.36, fall: 54, from: 0.35, drop: 16 },
  { x: 0.50, fall: 72, from: 0.22, drop: 20 },
  { x: 0.63, fall: 48, from: 0.45, drop: 15 },
  { x: 0.45, fall: 36, from: 0.62, drop: 11 },
];

export function SmashHero({ progress, size = 220 }: { progress: SharedValue<number>; size?: number }) {
  const logo = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [0, size * 0.05], Extrapolation.CLAMP) },
      { scaleY: interpolate(progress.value, [0, 1], [1, 0.84], Extrapolation.CLAMP) },
      { scaleX: interpolate(progress.value, [0, 1], [1, 1.06], Extrapolation.CLAMP) },
    ],
  }));

  return (
    <View style={{ width: size, height: size + 60, alignItems: 'center' }}>
      <Animated.View style={[{ width: size, height: size }, logo]}>
        <Image source={LOGO} style={{ width: size, height: size }} contentFit="contain" />
      </Animated.View>
      {DROPS.map((d, i) => (
        <Drop key={i} progress={progress} size={size} {...d} />
      ))}
    </View>
  );
}

function Drop({ progress, size, x, fall, from, drop: dropSize }: {
  progress: SharedValue<number>; size: number; x: number; fall: number; from: number; drop: number;
}) {
  // The burger's bottom sits about 78% down the logo image.
  const top = size * 0.78;
  const style = useAnimatedStyle(() => {
    const t = interpolate(progress.value, [from, 1], [0, 1], Extrapolation.CLAMP);
    return {
      opacity: interpolate(t, [0, 0.12, 1], [0, 1, 1]),
      transform: [
        { translateY: t * fall },
        { scale: interpolate(t, [0, 0.3, 1], [0.3, 1, 1.15]) },
      ],
    };
  });
  return (
    <Animated.View style={[st.drop, { left: size * x - dropSize / 2, top, width: dropSize, height: dropSize * 1.5 }, style]}>
      <Svg width={dropSize} height={dropSize * 1.5} viewBox="0 0 10 15">
        <Path d="M5 0 C5 0 0 6.5 0 10 A5 5 0 0 0 10 10 C10 6.5 5 0 5 0 Z" fill={theme.colors.heat} />
      </Svg>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  drop: { position: 'absolute' },
});
