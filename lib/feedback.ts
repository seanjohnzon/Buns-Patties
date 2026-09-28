// What a rating means, in the owner's words rather than a number.
export const RATINGS = [
  { value: 5, label: 'Great' },
  { value: 4, label: 'Good' },
  { value: 3, label: 'Fine' },
  { value: 2, label: 'Not great' },
  { value: 1, label: 'Bad' },
] as const;

/** Anything at or below this needs the owner to do something about it. */
export const NEEDS_ATTENTION_AT = 3;

export function needsAttention(rating: number | null, message: string | null) {
  if (rating !== null && rating <= NEEDS_ATTENTION_AT) return true;
  // A written complaint with no rating still counts.
  return rating === null && !!message && message.trim().length > 0;
}

export function summariseFeedback(rows: { rating: number | null; handled: boolean }[]) {
  const rated = rows.filter((r) => r.rating !== null) as { rating: number; handled: boolean }[];
  const average = rated.length ? rated.reduce((s, r) => s + r.rating, 0) / rated.length : null;
  return {
    total: rows.length,
    average: average === null ? null : Math.round(average * 10) / 10,
    unhappy: rated.filter((r) => r.rating <= NEEDS_ATTENTION_AT).length,
    unhandled: rows.filter((r) => !r.handled).length,
  };
}
