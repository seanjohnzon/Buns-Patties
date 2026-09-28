-- Run the reconciliation every five minutes, so a missed webhook is corrected
-- before a customer has finished wondering where their burger is.
--
-- Run once in the SQL editor, with your own values substituted.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'reconcile-orders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://<project-ref>.supabase.co/functions/v1/reconcile-orders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-reconcile-secret', '<RECONCILE_SECRET>'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- To check it is running:  select * from cron.job_run_details order by start_time desc limit 10;
-- To stop it:              select cron.unschedule('reconcile-orders');
