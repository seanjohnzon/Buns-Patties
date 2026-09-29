// Small pieces every function needs.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
};

export function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}

/** The service-role client: bypasses row rules, so only ever used server-side. */
export function admin() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}

/** Who is calling, from their own Supabase token. Null if nobody. */
export async function caller(req: Request) {
  const auth = req.headers.get('Authorization') ?? '';
  const { data: { user } } = await createClient(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: auth } } },
  ).auth.getUser();
  return user ?? null;
}

/** Best effort: a failed push must never undo anything. */
// deno-lint-ignore no-explicit-any
export async function notify(sb: any, userId: string, title: string, body: string) {
  try {
    const { data } = await sb.from('profiles').select('expo_push_token').eq('id', userId).maybeSingle();
    if (!data?.expo_push_token) return;
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: data.expo_push_token, title, body }),
    });
  } catch (_) { /* ignore */ }
}
