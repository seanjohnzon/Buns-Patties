-- Run the reconciliation every five minutes, so a missed webhook is corrected
-- before a customer has finished wondering where their burger is.
--
-- Run once per project, after schema.sql. One thing to change: the project
-- address on the line marked CHANGE. Nothing here is a secret you have to keep.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- This project's own address, and a secret made right here. Both live in
-- Supabase Vault; the secret never leaves the database (see reconcile_secret_ok
-- in schema.sql). Running this file again changes neither.
select vault.create_secret('https://<project-ref>.supabase.co', 'project_url', 'Where this project''s functions live')   -- CHANGE <project-ref>
  where not exists (select 1 from vault.secrets where name = 'project_url');
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'reconcile_secret', 'Shared by the cron job and reconcile-orders')
  where not exists (select 1 from vault.secrets where name = 'reconcile_secret');

select cron.schedule(
  'reconcile-orders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/reconcile-orders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-reconcile-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reconcile_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- To check it is running:  select * from cron.job_run_details order by start_time desc limit 10;
-- What the function answered: select status_code, content from net._http_response order by created desc limit 5;
-- To stop it:              select cron.unschedule('reconcile-orders');
