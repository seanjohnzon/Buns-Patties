// The client's onboarding form: /intake?c=<code>. What it costs him, his jobs
// (tick when done, notes for anything worth telling us), and the answers we need.
// It saves as he types and one button sends it to us. He can come back, change
// anything and send again. No sign-in: the private code in the link is the key.
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { deviceKV } from '@/lib/local/device';
import { getIntake, submitIntake } from '@/lib/api';
import { cleanIntake, emptyIntake, intakeProgress, type IntakeState } from '@/lib/intake';
import { intakeFor } from '@/lib/intake-links';
import { hasSupabase } from '@/lib/supabase';
import { theme } from '@/lib/theme';

export default function Intake() {
  const { c } = useLocalSearchParams<{ c?: string }>();
  const cfg = intakeFor(c);
  const [s, setS] = useState<IntakeState>(emptyIntake());
  const [ready, setReady] = useState(false);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const draftKey = `intake-draft:${c}`;
  const loaded = useRef(false);

  // What he already sent, then anything he typed since on this device.
  useEffect(() => {
    if (!cfg) return;
    (async () => {
      let base = emptyIntake();
      try { base = (await getIntake(c!)) ?? base; } catch { /* offline: draft only */ }
      try {
        const d = deviceKV().get(draftKey);
        if (d) { const draft = JSON.parse(d); base = { ...base, answers: { ...base.answers, ...draft.answers }, jobs: { ...base.jobs, ...draft.jobs } }; }
      } catch { /* no draft */ }
      setS(base); setReady(true); loaded.current = true;
    })();
  }, [c]);

  // Saves on the device as he types, so nothing is lost if he closes the page.
  useEffect(() => {
    if (!loaded.current) return;
    try { deviceKV().set(draftKey, JSON.stringify({ answers: s.answers, jobs: s.jobs })); } catch { /* storage off */ }
  }, [s]);

  const setAnswer = useCallback((k: string, v: string) => setS((x) => ({ ...x, answers: { ...x.answers, [k]: v } })), []);
  const setJob = useCallback((id: string, patch: Partial<{ done: boolean; note: string }>) =>
    setS((x) => ({ ...x, jobs: { ...x.jobs, [id]: { ...(x.jobs[id] ?? { done: false, note: '' }), ...patch } } })), []);

  async function send() {
    if (!cfg || !c) return;
    setSending(true); setMsg(null);
    try {
      const r = await submitIntake(c, cleanIntake(cfg, s));
      setS((x) => ({ ...x, submittedAt: r.submittedAt }));
      const when = new Date(r.submittedAt).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
      setMsg(r.sent
        ? { ok: true, text: `Sent to us — ${when}. Change anything and send again whenever you like.` }
        : { ok: true, text: `Saved on this device (${when}). Test mode: not connected to us yet.` });
    } catch (e: any) {
      setMsg({ ok: false, text: e.message ?? 'Could not send. Check your connection and try again.' });
    } finally { setSending(false); }
  }

  if (!cfg) {
    return <View style={st.page}><View style={st.wrap}><Text style={st.h1}>This link isn't right</Text><Text style={st.muted}>Ask us for a new one.</Text></View></View>;
  }
  if (!ready) return <View style={[st.page, { justifyContent: 'center' }]}><ActivityIndicator /></View>;

  const p = intakeProgress(cfg, s);

  return (
    <ScrollView style={st.page} contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Text style={st.kicker}>{cfg.business.toUpperCase()} · OPENING {cfg.opening.toUpperCase()}</Text>
      <Text style={st.h1}>What We Need</Text>
      <Text style={st.muted}>Tick each job when it's done and add a note if there's anything we should know. Answer what you can below, then press Send. It saves as you go.</Text>
      <Text style={st.progress}>{p.jobsDone} of {p.jobs} jobs done · {p.answered} of {p.questions} answers</Text>

      <Text style={st.band}>WHAT IT COSTS YOU</Text>
      <View style={st.card}>
        {cfg.costs.map((x, i) => (
          <View key={i} style={[st.costRow, i > 0 && st.rule]}>
            <View style={{ flex: 1 }}>
              <Text style={st.body}>{x.what}</Text>
              <Text style={st.small}>Paid to: {x.paidTo}</Text>
            </View>
            <Text style={st.amount}>{x.cost}</Text>
          </View>
        ))}
        <Text style={[st.small, { marginTop: 10 }]}>{cfg.costsNote}</Text>
      </View>

      <Text style={st.band}>YOUR JOBS</Text>
      {cfg.jobs.map((j, i) => {
        const js = s.jobs[j.id] ?? { done: false, note: '' };
        return (
          <View key={j.id} style={[st.card, st.job, js.done && st.jobDone]}>
            <Pressable onPress={() => setJob(j.id, { done: !js.done })} style={st.tickRow} accessibilityRole="checkbox" accessibilityState={{ checked: js.done }} accessibilityLabel={`${j.title} done`}>
              <View style={[st.box, js.done && st.boxOn]}>{js.done && <Text style={st.tick}>✓</Text>}</View>
              <Text style={[st.jobTitle, js.done && st.struck]}>{i + 1}. {j.title}</Text>
            </Pressable>
            <Text style={st.bodyMuted}>{j.text}</Text>
            {!!j.link && (
              <Text style={st.link} onPress={() => Linking.openURL(j.link!)}>{j.link.replace(/^https?:\/\//, '').replace(/\/$/, '')} ›</Text>
            )}
            <TextInput
              value={js.note}
              onChangeText={(v) => setJob(j.id, { note: v })}
              placeholder="Notes — e.g. requested Tuesday, waiting on Apple"
              placeholderTextColor={theme.colors.textMuted}
              multiline
              style={st.note}
            />
          </View>
        );
      })}

      <Text style={st.band}>YOUR ANSWERS</Text>
      <View style={[st.card, { gap: 16 }]}>
        {cfg.questions.map((q) => (
          <View key={q.id} style={{ gap: 6 }}>
            <Text style={st.label}>{q.label}</Text>
            {!!q.hint && <Text style={st.small}>{q.hint}</Text>}
            {q.options ? (
              <View style={st.options}>
                {q.options.map((o) => {
                  const on = s.answers[q.id] === o;
                  return (
                    <Pressable key={o} onPress={() => setAnswer(q.id, on ? '' : o)} style={[st.opt, on && st.optOn]} accessibilityRole="radio" accessibilityState={{ checked: on }}>
                      <Text style={[st.optText, on && { color: '#fff' }]}>{o}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            {(!q.options || q.other) && (
              <TextInput
                value={s.answers[q.options ? q.id + '_other' : q.id] ?? ''}
                onChangeText={(v) => setAnswer(q.options ? q.id + '_other' : q.id, v)}
                placeholder={q.other ?? ''}
                placeholderTextColor={theme.colors.textMuted}
                multiline={!!q.long}
                style={[st.input, q.long && { minHeight: 84 }]}
              />
            )}
          </View>
        ))}
      </View>

      <Pressable onPress={send} disabled={sending} style={({ pressed }) => [st.send, (pressed || sending) && { opacity: 0.8 }]}>
        <Text style={st.sendText}>{sending ? 'SENDING…' : s.submittedAt ? 'SEND AGAIN' : 'SEND TO US'}</Text>
      </Pressable>
      {msg && <Text style={[st.body, { color: msg.ok ? theme.colors.success : theme.colors.danger, textAlign: 'center' }]}>{msg.text}</Text>}
      {!msg && !!s.submittedAt && <Text style={[st.small, { textAlign: 'center' }]}>Last sent {new Date(s.submittedAt).toLocaleString()}.</Text>}
      {!hasSupabase && <Text style={[st.small, { textAlign: 'center' }]}>Test mode — answers stay on this device.</Text>}
      <Text style={[st.small, { textAlign: 'center', marginTop: 6 }]}>Questions? {cfg.sendTo}</Text>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  page: { flex: 1, backgroundColor: theme.colors.bgMuted },
  wrap: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 16, paddingBottom: 60, gap: 10 },
  kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4, color: theme.colors.textMuted, marginTop: 8 },
  h1: { fontSize: 34, fontWeight: '900', color: theme.colors.text, letterSpacing: -0.5 },
  muted: { fontSize: 15, lineHeight: 21, color: theme.colors.textMuted },
  progress: { fontSize: 13, fontWeight: '800', color: theme.colors.success, letterSpacing: 0.4 },
  band: { backgroundColor: theme.colors.brand, color: '#fff', fontWeight: '900', letterSpacing: 1.2, fontSize: 15, paddingVertical: 8, paddingHorizontal: 12, marginTop: 16, borderRadius: 6, overflow: 'hidden' },
  card: { backgroundColor: theme.colors.bg, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, padding: 14 },
  costRow: { flexDirection: 'row', gap: 12, paddingVertical: 9, alignItems: 'flex-start' },
  rule: { borderTopWidth: 1, borderTopColor: theme.colors.border },
  amount: { fontSize: 15, fontWeight: '800', color: theme.colors.text, textAlign: 'right', maxWidth: '45%' },
  body: { fontSize: 15, color: theme.colors.text, lineHeight: 21 },
  bodyMuted: { fontSize: 14.5, color: theme.colors.textMuted, lineHeight: 20 },
  small: { fontSize: 13, color: theme.colors.textMuted, lineHeight: 18 },
  job: { gap: 8, borderLeftWidth: 5, borderLeftColor: theme.colors.heat },
  jobDone: { borderLeftColor: theme.colors.success, opacity: 0.85 },
  tickRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  box: { width: 28, height: 28, borderRadius: 6, borderWidth: 2, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.bg },
  boxOn: { backgroundColor: theme.colors.success, borderColor: theme.colors.success },
  tick: { color: '#fff', fontWeight: '900', fontSize: 16 },
  jobTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: theme.colors.text },
  struck: { textDecorationLine: 'line-through', color: theme.colors.textMuted },
  link: { fontSize: 14, fontWeight: '700', color: theme.colors.text, textDecorationLine: 'underline' },
  note: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, padding: 10, fontSize: 15, minHeight: 44, color: theme.colors.text, backgroundColor: theme.colors.bgMuted },
  label: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, padding: 11, fontSize: 16, color: theme.colors.text, backgroundColor: theme.colors.bg },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  opt: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: theme.colors.bg },
  optOn: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  optText: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  send: { backgroundColor: theme.colors.success, borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginTop: 18 },
  sendText: { color: '#fff', fontWeight: '900', fontSize: 17, letterSpacing: 1 },
});
