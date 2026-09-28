// What UAT is for. Unhandled first, so the complaints are at the top.
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Alert, FlatList, View } from 'react-native';
import { Body, Button, Card, H2, Muted, Row, Screen } from '@/components/ui';
import { getOwnerFeedback, markFeedbackHandled, type FeedbackRow } from '@/lib/api';
import { needsAttention, summariseFeedback } from '@/lib/feedback';
import { theme } from '@/lib/theme';

export default function OwnerFeedback() {
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const load = useCallback(() => { getOwnerFeedback(30).then(setRows).catch(() => {}); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const s = summariseFeedback(rows);

  async function toggle(r: FeedbackRow) {
    setRows((xs) => xs.map((x) => (x.id === r.id ? { ...x, handled: !x.handled } : x)));
    try { await markFeedbackHandled(r.id, !r.handled); }
    catch (e: any) { load(); Alert.alert('Could not save', e.message ?? String(e)); }
  }

  return (
    <Screen>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        ListEmptyComponent={<Muted style={{ textAlign: 'center', marginTop: 40 }}>Nothing yet.</Muted>}
        ListHeaderComponent={
          <Card style={{ gap: 6, marginBottom: 6 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Body>Average</Body>
              <Body style={{ fontWeight: '700' }}>{s.average === null ? 'No ratings yet' : `${s.average} / 5`}</Body>
            </Row>
            <Row style={{ justifyContent: 'space-between' }}>
              <Body>Unhappy customers</Body>
              <Body style={{ fontWeight: '700', color: s.unhappy ? theme.colors.danger : theme.colors.text }}>{s.unhappy}</Body>
            </Row>
            <Muted>{s.unhandled} still to deal with, out of {s.total} in the last 30 days.</Muted>
          </Card>
        }
        renderItem={({ item: r }) => {
          const hot = needsAttention(r.rating, r.message);
          return (
            <Card style={{ gap: 8, opacity: r.handled ? 0.55 : 1, borderLeftWidth: 4, borderLeftColor: hot ? theme.colors.danger : theme.colors.border }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <H2>{r.rating ? `${r.rating} / 5` : 'No rating'}</H2>
                <Muted>{new Date(r.createdAt).toLocaleDateString()} · {r.build ?? '—'}</Muted>
              </Row>
              {!!r.message && <Body>“{r.message}”</Body>}
              <Button
                title={r.handled ? 'Dealt with' : 'Mark dealt with'}
                variant={r.handled ? 'secondary' : 'primary'}
                onPress={() => toggle(r)}
              />
            </Card>
          );
        }}
      />
    </Screen>
  );
}
