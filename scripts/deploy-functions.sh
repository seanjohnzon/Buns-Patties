#!/usr/bin/env bash
# Push the edge functions and their secrets to a Supabase project.
#
#   SUPABASE_PROJECT_REF=abcd ./scripts/deploy-functions.sh
#
# Secrets are read from .env.server (never committed). Run it once per
# environment — sandbox, SIT and UAT are separate projects.
set -euo pipefail

: "${SUPABASE_PROJECT_REF:?set SUPABASE_PROJECT_REF to the project ref from the Supabase URL}"

if [ ! -f .env.server ]; then
  echo "Missing .env.server. Copy .env.server.example and fill it in." >&2
  exit 1
fi

npm run typecheck:functions

echo "==> Deploying functions to $SUPABASE_PROJECT_REF"
# Called by the app with the customer's (or owner's) own token.
npx supabase functions deploy create-checkout --project-ref "$SUPABASE_PROJECT_REF"
npx supabase functions deploy square-connect  --project-ref "$SUPABASE_PROJECT_REF"
# Called by Square, which cannot send a Supabase token: checked by signature / state instead.
npx supabase functions deploy square-webhook --project-ref "$SUPABASE_PROJECT_REF" --no-verify-jwt
npx supabase functions deploy square-oauth   --project-ref "$SUPABASE_PROJECT_REF" --no-verify-jwt
# Called by cron with its own shared secret.
npx supabase functions deploy reconcile-orders --project-ref "$SUPABASE_PROJECT_REF" --no-verify-jwt

echo "==> Setting secrets"
npx supabase secrets set --project-ref "$SUPABASE_PROJECT_REF" --env-file .env.server

cat <<NEXT

Done. Still to do by hand, once per project (Square Developer Console, our app):
  1. OAuth → Redirect URL:
       https://$SUPABASE_PROJECT_REF.supabase.co/functions/v1/square-oauth
  2. Webhooks → Add subscription → URL:
       https://$SUPABASE_PROJECT_REF.supabase.co/functions/v1/square-webhook
     events: payment.created, payment.updated, refund.created, refund.updated
     then put its signature key in .env.server and re-run this script.
  3. Run supabase/cron.sql to schedule the reconciliation sweep.
NEXT
