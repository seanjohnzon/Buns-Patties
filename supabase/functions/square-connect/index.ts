// The owner's "Connect Square" button. Returns the squareup.com page where he
// signs in and presses Allow. Owner only; the state value ties the answer that
// comes back (square-oauth) to this request.
// Secrets: SQUARE_ENV, SQUARE_APPLICATION_ID, SUPABASE_*
import { admin, caller, cors, json } from '../_shared/http.ts';
import { SQUARE_SCOPES, squareBase } from '../_shared/square.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const user = await caller(req);
  if (!user) return json({ error: 'Sign in first.' }, 401);

  const sb = admin();
  const { data: me } = await sb.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (me?.role !== 'owner') return json({ error: 'Only the owner can connect Square.' }, 403);

  const state = crypto.randomUUID();
  await sb.from('square_oauth_states').insert({ state, user_id: user.id });

  const url = new URL(squareBase(Deno.env.get('SQUARE_ENV')) + '/oauth2/authorize');
  url.searchParams.set('client_id', Deno.env.get('SQUARE_APPLICATION_ID') ?? '');
  url.searchParams.set('scope', SQUARE_SCOPES.join(' '));
  url.searchParams.set('session', 'false');
  url.searchParams.set('state', state);
  return json({ url: url.toString() });
});
