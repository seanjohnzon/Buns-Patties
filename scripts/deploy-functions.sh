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

echo "==> Deploying functions to $SUPABASE_PROJECT_REF"

# The webhook is called by Stripe, which cannot send a Supabase auth header.
npx supabase functions deploy stripe-webhook --project-ref "$SUPABASE_PROJECT_REF" --no-verify-jwt

# These are called by the app with the customer's own token.
npx supabase functions deploy create-payment-intent   --project-ref "$SUPABASE_PROJECT_REF"
npx supabase functions deploy create-checkout-session --project-ref "$SUPABASE_PROJECT_REF"

# The sweep is called by cron with its own shared secret, not a user token.
npx supabase functions deploy reconcile-orders --project-ref "$SUPABASE_PROJECT_REF" --no-verify-jwt

echo "==> Setting secrets"
npx supabase secrets set --project-ref "$SUPABASE_PROJECT_REF" --env-file .env.server

echo
echo "Done. Still to do by hand, once per project:"
echo "  1. Stripe dashboard -> Webhooks -> add"
echo "     https://$SUPABASE_PROJECT_REF.supabase.co/functions/v1/stripe-webhook"
echo "     events: payment_intent.succeeded, payment_intent.payment_failed,"
echo "             payment_intent.canceled, charge.refunded,"
echo "             checkout.session.completed, checkout.session.expired"
echo "     then put its signing secret in .env.server and re-run this script."
echo "  2. Run supabase/cron.sql to schedule the reconciliation sweep."
