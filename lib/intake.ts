// Client intake: the onboarding form a client fills in (costs, his jobs with a
// tick and notes, and the answers we need). It is sent straight to us — the start
// of our own onboarding site. One JSON file per client in data/intake/.

export type IntakeConfig = {
  code: string;
  business: string;
  opening: string;
  sendTo: string;
  costs: { what: string; cost: string; paidTo: string }[];
  costsNote: string;
  jobs: { id: string; title: string; text: string; link?: string }[];
  questions: { id: string; label: string; hint?: string; options?: string[]; other?: string; long?: boolean }[];
};

export type JobState = { done: boolean; note: string };
export type IntakeState = {
  answers: Record<string, string>;
  jobs: Record<string, JobState>;
  submittedAt: string | null;
};

export const emptyIntake = (): IntakeState => ({ answers: {}, jobs: {}, submittedAt: null });

/** How far along he is: jobs ticked and questions answered. */
export function intakeProgress(cfg: IntakeConfig, s: IntakeState) {
  const jobsDone = cfg.jobs.filter((j) => s.jobs[j.id]?.done).length;
  const answered = cfg.questions.filter((q) => (s.answers[q.id] ?? '').trim() || (s.answers[q.id + '_other'] ?? '').trim()).length;
  return { jobsDone, jobs: cfg.jobs.length, answered, questions: cfg.questions.length };
}

/** Keep what is sent small and clean: known ids only, trimmed, capped. */
export function cleanIntake(cfg: IntakeConfig, s: IntakeState): Omit<IntakeState, 'submittedAt'> {
  const answers: Record<string, string> = {};
  for (const q of cfg.questions) {
    for (const k of [q.id, q.id + '_other']) {
      const v = (s.answers[k] ?? '').trim().slice(0, 4000);
      if (v) answers[k] = v;
    }
  }
  const jobs: Record<string, JobState> = {};
  for (const j of cfg.jobs) {
    const v = s.jobs[j.id];
    if (v && (v.done || v.note.trim())) jobs[j.id] = { done: !!v.done, note: v.note.trim().slice(0, 2000) };
  }
  return { answers, jobs };
}
