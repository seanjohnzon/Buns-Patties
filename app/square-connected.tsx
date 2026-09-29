// Where Square sends the owner after he presses Allow (via the square-oauth
// function). Says what happened in plain words; he closes it and goes back.
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/ui';
import { theme } from '@/lib/theme';

export default function SquareConnected() {
  const { title, msg } = useLocalSearchParams<{ title?: string; msg?: string }>();
  return (
    <Screen style={s.wrap}>
      <View style={{ gap: 10, maxWidth: 440 }}>
        <Text style={s.title}>{title || 'Square'}</Text>
        <Text style={s.body}>{msg || 'You can close this page and go back to the app.'}</Text>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  wrap: { padding: 24, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 26, fontWeight: '800', color: theme.colors.text },
  body: { fontSize: 17, lineHeight: 24, color: theme.colors.text },
});
