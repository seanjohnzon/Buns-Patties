// Where Square sends the owner back after he presses Allow. Swaps the one-time
// code for a token, finds his location, and stores both where only the server
// can read them. Set this function's URL as the OAuth Redirect URL in the
// Square Developer Console.
// Secrets: SQUARE_ENV, SQUARE_APPLICATION_ID, SQUARE_APPLICATION_SECRET, SUPABASE_*
import { admin } from '../_shared/http.ts';
import { SQUARE_VERSION, mainLocation, squareBase, squareFetch } from '../_shared/square.ts';

Deno.serve(async (req) => {
  const q = new URL(req.url).searchParams;
  const sb = admin();
  const base = squareBase(Deno.env.get('SQUARE_ENV'));

  if (q.get('error')) return page('Not connected', 'Square said: ' + (q.get('error_description') ?? q.get('error')) + '. Nothing has changed.');

  const state = q.get('state') ?? '';
  const { data: s } = await sb.from('square_oauth_states').select('*').eq('state', state).maybeSingle();
  if (!s || Date.now() - new Date(s.created_at).getTime() > 30 * 60 * 1000) {
    return page('Link expired', 'Open the Connect Square button in the app again.');
  }
  await sb.from('square_oauth_states').delete().eq('state', state);

  const t = await fetch(base + '/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Square-Version': SQUARE_VERSION },
    body: JSON.stringify({
      client_id: Deno.env.get('SQUARE_APPLICATION_ID'), client_secret: Deno.env.get('SQUARE_APPLICATION_SECRET'),
      code: q.get('code'), grant_type: 'authorization_code',
    }),
  }).then((r) => r.json());
  if (!t?.access_token) return page('Not connected', 'Square did not hand over access. Try the button again.');

  // His main (first active) location is where app orders are charged and listed.
  let location: any = null, business = '';
  try {
    const l = await squareFetch(base, t.access_token, '/v2/locations');
    location = mainLocation(l.locations);
    business = location?.business_name ?? location?.name ?? '';
  } catch (_) { /* stored without; the owner screen will say so */ }

  const { error } = await sb.from('square_connection').upsert({
    id: 1,
    merchant_id: t.merchant_id, access_token: t.access_token, refresh_token: t.refresh_token, expires_at: t.expires_at,
    location_id: location?.id ?? null, location_name: location?.name ?? null, business_name: business || null,
    connected_by: s.user_id, connected_at: new Date().toISOString(),
  });
  if (error) return page('Not connected', 'Could not save the connection: ' + error.message);
  return page('Square connected', `App orders will be paid into ${business || 'your Square account'}${location?.name ? ` (${location.name})` : ''}. You can close this page.`);
});

/**
 * Where the owner lands after Allow. Supabase serves HTML from functions as plain
 * text, so the answer is shown by a page on the website (app/square-connected.tsx).
 */
function page(title: string, body: string) {
  const site = Deno.env.get('PUBLIC_SITE_URL');
  if (site) {
    const u = new URL(site + '/square-connected');
    u.searchParams.set('title', title);
    u.searchParams.set('msg', body);
    return Response.redirect(u.toString(), 302);
  }
  return new Response(`${title}. ${body}`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
