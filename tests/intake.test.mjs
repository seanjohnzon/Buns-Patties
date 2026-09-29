// The client intake form (app/intake.tsx): what counts as progress, and what is
// actually sent to us.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cfg = JSON.parse(readFileSync(new URL('../data/intake/buns-and-patties.json', import.meta.url)));
import { cleanIntake, intakeProgress } from '../lib/intake.ts';

test('costs come first and every cost says who is paid', () => {
  assert.ok(cfg.costs.length >= 5);
  for (const c of cfg.costs) assert.ok(c.what && c.cost && c.paidTo, JSON.stringify(c));
  assert.ok(cfg.costs.some((c) => /Apple/.test(c.what)) && cfg.costs.some((c) => /Square/.test(c.paidTo)));
});

test('progress counts ticked jobs and answered questions', () => {
  const s = { answers: { legal: 'Buns and Patties LLC', domain: '', domain_other: 'bnp.com' }, jobs: { duns: { done: true, note: '' }, google: { done: false, note: 'in progress' } }, submittedAt: null };
  assert.deepEqual(intakeProgress(cfg, s), { jobsDone: 1, jobs: cfg.jobs.length, answered: 2, questions: cfg.questions.length });
});

test('only real fields are sent, trimmed; empty jobs are left out; notes are kept', () => {
  const s = {
    answers: { legal: '  Buns and Patties LLC  ', hacker: 'x'.repeat(10), story: '' },
    jobs: { duns: { done: true, note: ' requested Tue ' }, google: { done: false, note: '' }, nope: { done: true, note: '' } },
    submittedAt: null,
  };
  assert.deepEqual(cleanIntake(cfg, s), { answers: { legal: 'Buns and Patties LLC' }, jobs: { duns: { done: true, note: 'requested Tue' } } });
});

test('the database only lets the form reach its own row, by its code', () => {
  const schema = readFileSync('supabase/schema.sql', 'utf8');
  const part = schema.slice(schema.indexOf('-- ---------- client intake'));
  assert.match(part, /alter table client_intake enable row level security;/);
  assert.doesNotMatch(part, /create policy/, 'no policies: only the two functions touch it');
  assert.match(part, /where code = p_code/);
});
