// UAT exists to surface complaints. If these are wrong, a bad review sits unread.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needsAttention, summariseFeedback, NEEDS_ATTENTION_AT, RATINGS } from '../lib/feedback.ts';

test('a low rating needs the owner to do something', () => {
  assert.equal(needsAttention(1, null), true);
  assert.equal(needsAttention(3, null), true, '3 out of 5 from a customer is not fine');
  assert.equal(needsAttention(4, null), false);
});

test('a written complaint counts even with no rating', () => {
  assert.equal(needsAttention(null, 'burger was cold'), true);
  assert.equal(needsAttention(null, '   '), false);
  assert.equal(needsAttention(null, null), false);
});

test('a high rating with a written note is not flagged as a problem', () => {
  assert.equal(needsAttention(5, 'loved it'), false);
});

test('the summary counts unhappy customers, not just an average', () => {
  // An average hides a handful of angry people; the count does not.
  const rows = [
    { rating: 5, handled: true }, { rating: 5, handled: true }, { rating: 5, handled: true },
    { rating: 1, handled: false }, { rating: 2, handled: false },
  ];
  const s = summariseFeedback(rows);
  assert.equal(s.total, 5);
  assert.equal(s.average, 3.6);
  assert.equal(s.unhappy, 2);
  assert.equal(s.unhandled, 2);
});

test('feedback with no ratings at all does not produce a fake average', () => {
  const s = summariseFeedback([{ rating: null, handled: false }]);
  assert.equal(s.average, null, 'an average of nothing must be null, never 0');
  assert.equal(s.total, 1);
  assert.equal(s.unhandled, 1);
});

test('no feedback yet summarises cleanly', () => {
  const s = summariseFeedback([]);
  assert.deepEqual(s, { total: 0, average: null, unhappy: 0, unhandled: 0 });
});

test('the rating scale runs best to worst and covers the threshold', () => {
  assert.equal(RATINGS[0].value, 5);
  assert.equal(RATINGS[RATINGS.length - 1].value, 1);
  assert.ok(RATINGS.some((r) => r.value === NEEDS_ATTENTION_AT));
});
