// Until real food photos arrive, items fall back to the logo on a warm tile
// instead of an empty grey box.
import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { theme } from '@/lib/theme';

const LOGO = require('@/assets/brand/logo.png');

export function ItemImage({ uri, style, logoScale = 0.62 }: { uri: string | null; style: StyleProp<ViewStyle>; logoScale?: number }) {
  if (uri) return <Image source={{ uri }} style={style as any} contentFit="cover" />;
  return (
    <View style={[style, s.fallback]}>
      <Image source={LOGO} style={{ width: `${logoScale * 100}%`, height: `${logoScale * 100}%`, opacity: 0.35 }} contentFit="contain" />
    </View>
  );
}

const s = StyleSheet.create({
  fallback: { backgroundColor: theme.colors.bgMuted, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
