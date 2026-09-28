// A truck runs on mobile data behind a metal wall. Loads fail. Showing an empty
// screen makes a customer think there is no food; this tells them the truth and
// gives them the one button that fixes it.
import { View } from 'react-native';
import { Body, Button, H2, Muted, Screen } from './ui';

export function LoadFailed({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <Screen style={{ alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 }}>
      <H2>Couldn't load the {what}</H2>
      <Muted style={{ textAlign: 'center' }}>Probably the signal. Try again in a second.</Muted>
      <View style={{ height: 6 }} />
      <Button title="Try again" onPress={onRetry} />
      <Body style={{ textAlign: 'center' }}>
        <Muted>Still stuck? Order at the window as usual.</Muted>
      </Body>
    </Screen>
  );
}
