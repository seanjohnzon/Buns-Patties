-- Run this once in the Supabase SQL editor. Everything the app needs.

create extension if not exists pgcrypto;

-- ---------- profiles ----------
-- One account type, three roles. There is no separate admin login: the owner
-- signs in with the same phone code as everyone else and their role decides what
-- they see. Square and Toast work the same way — a second password system would be
-- one more thing to secure for no gain.
create type app_role as enum ('customer', 'staff', 'owner');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  phone text,
  birthday date,
  role app_role not null default 'customer',
  expo_push_token text,
  created_at timestamptz default now()
);

-- Role checks live in SECURITY DEFINER functions so RLS policies on other tables
-- don't have to re-query profiles (which would recurse through its own policy).
create or replace function is_staff() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('staff','owner'));
$$;

create or replace function is_owner() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'owner');
$$;

-- profile row on new auth user. No signup bonus: the welcome drink is earned
-- by following, not given away for installing.
-- The search path is set here on purpose: sign-in runs as Supabase's auth role,
-- which only looks in the auth schema, so without it "profiles" is not found and
-- nobody can sign up at all.
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, phone) values (new.id, new.phone);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- ---------- menu ----------
create table categories (
  id text primary key,
  name text not null,
  sort int not null default 0
);

create table menu_items (
  id text primary key,
  category_id text not null references categories(id),
  name text not null,
  description text,
  price numeric(10,2) not null,
  image_url text,
  modifier_groups jsonb not null default '[]',   -- same shape as lib/types ModifierGroup[]
  includes jsonb not null default '[]',          -- what comes on it, listed, not removable
  defaults jsonb not null default '{}',          -- options pre-picked when it opens: {"sauce":["s_bbq"]}
  featured boolean not null default false,
  available boolean not null default true,
  sold_out_until date,                            -- staff flip this when they run out
  sort int not null default 0
);

create table truck_status (
  id int primary key default 1 check (id = 1),
  is_open boolean not null default false,
  location_name text,
  address text,
  lat double precision,
  lng double precision,
  hours_text text,
  prep_minutes int not null default 15,
  halal boolean not null default true,
  instagram text,
  -- The truck's page, set by the owner. Empty fields are simply not shown.
  story text,
  contact_phone text,
  contact_email text,
  tiktok text,
  facebook text,
  doordash_url text,
  ubereats_url text,
  grubhub_url text,
  testimonials jsonb not null default '[]',   -- [{"name","quote","stars"}], his picks from Google
  -- Off until the owner's Square is connected and a real $1 order has gone
  -- through and been refunded. While off,
  -- only $0 orders (the free drink) can go through; paid carts are told to pay
  -- at the window instead of hitting an error at checkout.
  payments_enabled boolean not null default false
);
insert into truck_status (id, is_open, location_name, address, hours_text, instagram) values (1, false, 'TBD', 'Houston, TX', 'TBD', 'https://www.instagram.com/buns.patties');

-- ---------- orders ----------
create type order_status as enum ('pending_payment','received','preparing','ready','completed','cancelled');

create table orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  status order_status not null default 'pending_payment',
  subtotal numeric(10,2) not null,
  tax numeric(10,2) not null default 0,
  tip numeric(10,2) not null default 0,
  discount numeric(10,2) not null default 0,   -- what the free lines were worth; NOT taken off total
  total numeric(10,2) not null,
  stamps_earned int not null default 0,
  stamp_spend jsonb not null default '{}',     -- {"stamp_card": 5}: given back if the order dies
  pickup_at timestamptz,
  pickup_name text,               -- called out at the window, DoorDash style
  -- Square: the itemised order on the owner's account, its hosted payment page,
  -- and the payment once made. The order row is written before any of these exist.
  square_order_id text unique,
  square_payment_link_id text,
  square_payment_id text unique,
  square_paid_at timestamptz,     -- when Square said it was paid; set even if opening the order fails
  checkout_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table order_lines (
  id bigserial primary key,
  order_id uuid not null references orders(id) on delete cascade,
  menu_item_id text,
  name text not null,
  qty int not null,
  unit_price numeric(10,2) not null,
  mods text[] not null default '{}',
  note text,
  campaign_id text,                -- set when this line was a reward
  list_price numeric(10,2)         -- what it would have cost, for the owner's "given away"
);

-- Paid: a stamp on every live stamp card whose minimum it clears.
-- Dead (cancelled — an abandoned checkout, or a refund): give back what it spent,
-- and take back the stamp it earned. Nobody loses a reward to a failed payment.
create or replace function on_order_paid() returns trigger language plpgsql security definer set search_path = public as $$
declare c record; k text; n int;
begin
  if old.status = 'pending_payment' and new.status = 'received' then
    for c in select id from campaigns
             where kind = 'stamps' and active and (ends_at is null or ends_at > now())
               and new.subtotal > 0 and new.subtotal >= coalesce(min_order, 0) loop
      insert into campaign_stamps (campaign_id, user_id, stamps) values (c.id, new.user_id, 1)
        on conflict (campaign_id, user_id) do update set stamps = campaign_stamps.stamps + 1, updated_at = now();
      new.stamps_earned := new.stamps_earned + 1;
      new.stamp_spend := new.stamp_spend || jsonb_build_object('earned:' || c.id, 1);
    end loop;
  end if;

  if new.status = 'cancelled' and old.status <> 'cancelled' then
    for k, n in select key, value::int from jsonb_each_text(new.stamp_spend) loop
      if k like 'earned:%' then
        update campaign_stamps set stamps = greatest(0, stamps - n), updated_at = now()
          where campaign_id = substr(k, 8) and user_id = new.user_id;
      else
        insert into campaign_stamps (campaign_id, user_id, stamps) values (k, new.user_id, n)
          on conflict (campaign_id, user_id) do update set stamps = campaign_stamps.stamps + n, updated_at = now();
      end if;
    end loop;
    new.stamps_earned := 0;
    -- One-off offers (the free drink) become usable again.
    update campaign_claims set used_at = null, used_order_id = null where used_order_id = new.id;
  end if;

  new.updated_at := now();
  return new;
end $$;
create trigger on_order_status before update on orders for each row execute function on_order_paid();

-- ---------- RLS ----------
alter table profiles enable row level security;
alter table orders enable row level security;
alter table order_lines enable row level security;
alter table categories enable row level security;
alter table menu_items enable row level security;
alter table truck_status enable row level security;

create policy "public read menu" on categories for select using (true);
create policy "public read items" on menu_items for select using (true);
create policy "public read status" on truck_status for select using (true);

create policy "own profile" on profiles for select using (id = auth.uid() or is_staff());
create policy "update own profile" on profiles for update using (id = auth.uid());
-- Only the owner may change anyone's role, and never their own (no self-demotion
-- locking the truck out, no staff promoting themselves).
create policy "owner sets roles" on profiles for update using (is_owner() and id <> auth.uid());

create policy "own orders" on orders for select using (user_id = auth.uid() or is_staff());
create policy "staff update orders" on orders for update using (is_staff());
create policy "own lines" on order_lines for select using (exists (select 1 from orders o where o.id = order_id and (o.user_id = auth.uid() or is_staff())));
create policy "staff manage status" on truck_status for update using (is_staff());
create policy "staff manage items" on menu_items for all using (is_staff());

-- realtime for order status
alter publication supabase_realtime add table orders;

-- ---------- owner reporting ----------
-- Aggregated in the database and returned as small JSON, so the phone never
-- downloads the order history to add it up. Every one refuses a non-owner.
-- Paid orders only: 'pending_payment' and 'cancelled' never count as money.

create or replace function owner_today(p_tz text default 'America/Chicago')
returns json language plpgsql stable security definer set search_path = public as $$
declare
  today_start timestamptz := date_trunc('day', now() at time zone p_tz) at time zone p_tz;
  result json;
begin
  if not is_owner() then raise exception 'owner only'; end if;

  with windows as (
    select
      -- today so far
      sum(case when created_at >= today_start then subtotal end)                     as net_today,
      sum(case when created_at >= today_start then tip end)                          as tips_today,
      count(*) filter (where created_at >= today_start)                              as orders_today,
      sum(case when created_at >= today_start then discount end)                     as discount_today,
      -- the same slice of the day, one week ago (Toast's day-over-day comparison)
      sum(case when created_at >= today_start - interval '7 days'
                and created_at < today_start - interval '7 days' + (now() - today_start)
               then subtotal end)                                                    as net_last_week,
      count(*) filter (where created_at >= today_start - interval '7 days'
                         and created_at < today_start - interval '7 days' + (now() - today_start))
                                                                                     as orders_last_week
    from orders
    where status not in ('pending_payment', 'cancelled')
  )
  select json_build_object(
    'netToday',       coalesce(net_today, 0),
    'tipsToday',      coalesce(tips_today, 0),
    'ordersToday',    coalesce(orders_today, 0),
    'discountToday',  coalesce(discount_today, 0),
    'netLastWeek',    coalesce(net_last_week, 0),
    'ordersLastWeek', coalesce(orders_last_week, 0)
  ) into result from windows;
  return result;
end $$;

-- What actually sold, so the owner knows what to prep tomorrow.
create or replace function owner_product_mix(p_days int default 7)
returns table (menu_item_id text, name text, qty bigint, revenue numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_owner() then raise exception 'owner only'; end if;
  return query
    select l.menu_item_id, min(l.name), sum(l.qty)::bigint, sum(l.unit_price * l.qty)
    from order_lines l
    join orders o on o.id = l.order_id
    where o.status not in ('pending_payment', 'cancelled')
      and o.created_at >= now() - make_interval(days => p_days)
    group by l.menu_item_id
    order by sum(l.qty) desc;
end $$;

-- Who is signing up, and what the giveaways are costing this week.
create or replace function owner_loyalty()
returns json language plpgsql stable security definer set search_path = public as $$
declare result json;
begin
  if not is_owner() then raise exception 'owner only'; end if;
  select json_build_object(
    'members',          (select count(*) from profiles where role = 'customer'),
    'newThisWeek',      (select count(*) from profiles where created_at >= now() - interval '7 days'),
    'givenThisWeek',    coalesce((select sum(l.qty) from order_lines l join orders o on o.id = l.order_id
                                   where l.campaign_id is not null and o.status not in ('pending_payment','cancelled')
                                     and o.created_at >= now() - interval '7 days'), 0),
    'givenValueThisWeek', coalesce((select sum(l.list_price * l.qty) from order_lines l join orders o on o.id = l.order_id
                                   where l.campaign_id is not null and o.status not in ('pending_payment','cancelled')
                                     and o.created_at >= now() - interval '7 days'), 0)
  ) into result;
  return result;
end $$;

-- ---------- making the first owner ----------
-- Everyone who signs up is a customer. There is deliberately no way to promote
-- yourself from inside the app — otherwise the first person to find the screen
-- owns the truck. So the very first owner is set here, by hand, once:
--
--   1. Cihan installs the app and signs in with his own number.
--   2. Run this in the Supabase SQL editor, with his number in E.164 digits
--      (no plus, no spaces — that is how auth.users stores it):
--
--        update profiles set role = 'owner' where phone = '17135554402';
--
--   3. He reopens the app. "How the truck is doing" is now on his Account tab.
--
-- From then on he adds everyone else from his phone, and nobody touches SQL again.
-- To check it worked:
--
--   select phone, role from profiles where role <> 'customer';

-- Guard rail: never let the truck end up with nobody in charge.
create or replace function protect_last_owner() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'owner' and new.role <> 'owner'
     and (select count(*) from profiles where role = 'owner') <= 1 then
    raise exception 'that is the only owner — make someone else an owner first';
  end if;
  return new;
end $$;
create trigger keep_one_owner before update on profiles
  for each row when (old.role is distinct from new.role)
  execute function protect_last_owner();

-- Guard rail: "update own profile" lets people edit their own row, so the row
-- itself must refuse the columns that are not theirs to change. A role changes
-- only when an owner changes SOMEONE ELSE's role (or from the SQL editor / server,
-- where there is no signed-in user). The phone number is set by sign-in, never edited.
create or replace function protect_profile_columns() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;   -- SQL editor, service role
  if new.role is distinct from old.role and (not is_owner() or new.id = auth.uid()) then
    raise exception 'only the owner can change someone''s role';
  end if;
  if new.phone is distinct from old.phone then
    raise exception 'the phone number comes from sign-in';
  end if;
  return new;
end $$;
create trigger protect_profile_columns before update on profiles
  for each row execute function protect_profile_columns();

-- ---------- feedback ----------
-- UAT is real customers, so the point of it is what they tell you. Captured in
-- the app rather than chased on Instagram, and tied to the build it came from
-- so "it broke" can be traced to a version.
create table feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  order_id uuid references orders(id) on delete set null,
  rating int check (rating between 1 and 5),
  message text,
  build text,                     -- app version it came from
  env text,                       -- sandbox | sit | uat
  handled boolean not null default false,
  created_at timestamptz default now()
);

alter table feedback enable row level security;
create policy "leave own feedback" on feedback for insert with check (user_id = auth.uid());
create policy "read own feedback"  on feedback for select using (user_id = auth.uid() or is_owner());
create policy "owner marks handled" on feedback for update using (is_owner());

create or replace function owner_feedback(p_days int default 30)
returns table (id uuid, rating int, message text, build text, handled boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_owner() then raise exception 'owner only'; end if;
  return query
    select f.id, f.rating, f.message, f.build, f.handled, f.created_at
    from feedback f
    where f.created_at >= now() - make_interval(days => p_days)
    order by f.handled asc, f.created_at desc;
end $$;

-- ---------- payment plumbing ----------
-- Every Square event we are handed, kept so a failure is visible rather than
-- silent. The primary key is Square's own event id, which makes replays safe.
create table webhook_events (
  id text primary key,            -- Square event_id, or reconcile-<ts>
  type text not null,
  received_at timestamptz not null default now(),
  handled_at timestamptz,         -- null = we never finished it
  error text
);

alter table webhook_events enable row level security;
create policy "owner reads webhook events" on webhook_events for select using (is_owner());

-- Orders Square says are PAID that never reached the kitchen. Should always be
-- empty. Only orders with square_paid_at count — an unpaid checkout is not "stuck",
-- and must never be one tap away from the kitchen.
create or replace function stuck_orders()
returns table (id uuid, created_at timestamptz, total numeric, square_order_id text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'staff only'; end if;
  return query
    select o.id, o.created_at, o.total, o.square_order_id
    from orders o
    where o.status = 'pending_payment'
      and o.square_paid_at is not null
      and o.created_at < now() - interval '5 minutes'
      and o.created_at > now() - interval '2 days'
    order by o.created_at;
end $$;

-- The sweep (reconcile-orders, run by supabase/cron.sql) proves itself with a
-- secret that is made inside this database and kept in Supabase Vault. Nobody
-- types it, copies it or sees it: the cron job reads it to send, and the
-- function asks here whether what it was sent is right. Server only.
create or replace function reconcile_secret_ok(p_secret text) returns boolean
  language sql stable security definer set search_path = '' as $$
  select coalesce(length(p_secret), 0) >= 32 and exists (
    select 1 from vault.decrypted_secrets where name = 'reconcile_secret' and decrypted_secret = p_secret
  );
$$;
revoke execute on function reconcile_secret_ok(text) from public, anon, authenticated;
grant execute on function reconcile_secret_ok(text) to service_role;

-- ---------- campaigns ----------
-- Everything we give away is a campaign. There are no points. Two kinds:
--   action — do one thing (follow, tag, open a link), get one free item. The free
--            drink on the sticker is one of these.
--   stamps — every order over min_order is a stamp; tiers say what 5 or 10 buy.
-- The owner builds both from his phone.
--
-- Nothing anyone gives away here can be verified — Instagram and Google will not
-- tell an app who followed, liked or reviewed. So the controls are not "did they
-- really do it", they are: ONE claim per account (a phone number that had to
-- receive a text), a HARD CAP on total claims, and an END DATE. Worst case is
-- known before it starts: max_claims x what it costs you.
create table campaigns (
  id text primary key,
  kind text not null default 'action' check (kind in ('action', 'stamps')),
  title text not null,                       -- "Free drink on us"
  blurb text,                                -- shown under the title
  fine_print text,                           -- "Orders of $15 or more count."
  -- action: any ONE of these unlocks it: [{"id":"follow_instagram","label":"Follow us","url":"https://..."}]
  actions jsonb not null default '[]',
  reward_item_ids text[] not null default '{}',   -- action: they pick one of these
  reward_cover jsonb not null default '{}',       -- option-group dollars that are free too: {"patty": 2}
  -- stamps
  min_order numeric(10,2),                   -- food before tax, to earn a stamp
  tiers jsonb not null default '[]',         -- [{"stamps":5,"label":"Free fries","itemIds":["seasoned_fries"],"cover":{}}]
  max_claims int,                            -- null = no cap (avoid)
  claims_count int not null default 0,
  starts_at timestamptz default now(),
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz default now()
);

create table campaign_claims (
  campaign_id text not null references campaigns(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  unlocked_by text,                          -- which action they said they did
  unlocked_at timestamptz default now(),
  used_order_id uuid references orders(id) on delete set null,
  used_at timestamptz,
  primary key (campaign_id, user_id)         -- one per person per campaign, full stop
);

-- Stamp card balances. Written only by the order trigger and spend_stamps().
create table campaign_stamps (
  campaign_id text not null references campaigns(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  stamps int not null default 0 check (stamps >= 0),
  updated_at timestamptz default now(),
  primary key (campaign_id, user_id)
);

alter table campaigns enable row level security;
alter table campaign_claims enable row level security;
alter table campaign_stamps enable row level security;
create policy "own stamps" on campaign_stamps for select using (user_id = auth.uid() or is_owner());

create policy "anyone reads live campaigns" on campaigns for select
  using (active and (ends_at is null or ends_at > now()));
create policy "owner manages campaigns" on campaigns for all using (is_owner());
create policy "own claims" on campaign_claims for select using (user_id = auth.uid() or is_owner());

-- Claiming goes through this, never a direct insert: it takes the cap and the
-- end date into account, and it cannot be talked into handing out two.
create or replace function claim_campaign(p_campaign text, p_action text)
returns json language plpgsql security definer set search_path = public as $$
declare c campaigns%rowtype;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;

  select * into c from campaigns where id = p_campaign for update;
  if not found or not c.active then raise exception 'that offer is not running'; end if;
  if c.ends_at is not null and c.ends_at <= now() then raise exception 'that offer has ended'; end if;
  if c.starts_at is not null and c.starts_at > now() then raise exception 'that offer has not started'; end if;
  if c.kind <> 'action' then raise exception 'that offer is earned by ordering'; end if;
  if c.max_claims is not null and c.claims_count >= c.max_claims then raise exception 'that offer is all gone'; end if;
  -- The action has to be one this campaign actually offers.
  if not exists (select 1 from jsonb_array_elements(c.actions) a where a->>'id' = p_action) then
    raise exception 'not one of the things this offer asks for';
  end if;

  insert into campaign_claims (campaign_id, user_id, unlocked_by)
  values (p_campaign, auth.uid(), p_action)
  on conflict (campaign_id, user_id) do nothing;

  if found then
    update campaigns set claims_count = claims_count + 1 where id = p_campaign;
  end if;

  return json_build_object('campaignId', p_campaign, 'unlockedBy', p_action);
end $$;


-- Spending stamps on a reward. Only the checkout function calls this (service
-- role); customers cannot. Conditional, so two checkouts at once cannot both spend
-- the same stamps.
create or replace function spend_stamps(p_user uuid, p_campaign text, p_n int)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update campaign_stamps set stamps = stamps - p_n, updated_at = now()
    where campaign_id = p_campaign and user_id = p_user and stamps >= p_n;
  return found;
end $$;
revoke execute on function spend_stamps(uuid, text, int) from public, anon, authenticated;

-- The two campaigns that ship with the app. Everything after this the owner makes.
-- 1. The drink on the sticker: follow us, pick any can. One per phone number.
insert into campaigns (id, kind, title, blurb, actions, reward_item_ids, max_claims) values (
  'welcome_drink', 'action',
  'Free drink',
  'Follow us and your first drink is on us',
  '[{"id":"follow_instagram","label":"Follow us on Instagram","url":"https://www.instagram.com/buns.patties"}]'::jsonb,
  '{can_drink}',
  1000            -- a known ceiling: 1000 drinks, then it stops on its own
);
-- 2. The stamp card. Fries at 5, or keep going to a burger at 10. The free burger
--    is any burger but Build Your Own; a double patty is on us ($2), a triple pays
--    the difference, and paid toppings are paid.
insert into campaigns (id, kind, title, blurb, fine_print, min_order, tiers) values (
  'stamp_card', 'stamps',
  'Stamp card',
  'Every order is a stamp',
  'Orders of $15 or more before tax earn a stamp. One stamp per order. Taking a reward uses its stamps.',
  15,
  '[{"stamps":5,"label":"Free fries","itemIds":["seasoned_fries"],"cover":{}},
    {"stamps":10,"label":"Free burger","itemIds":["og","wake_n_smash","lone_star_heat","bbq_bacon"],"cover":{"patty":2}}]'::jsonb
);

-- What each campaign has actually cost, for the owner screen: the full price of
-- every reward line in a paid order.
create or replace function owner_campaigns()
returns table (
  id text, kind text, title text, active boolean, ends_at timestamptz,
  max_claims int, claims_count int, used_count bigint, cost numeric
) language plpgsql stable security definer set search_path = public as $$
begin
  if not is_owner() then raise exception 'owner only'; end if;
  return query
    select c.id, c.kind, c.title, c.active, c.ends_at, c.max_claims, c.claims_count,
           coalesce(sum(l.qty) filter (where o.id is not null), 0)::bigint as used_count,
           coalesce(sum(l.list_price * l.qty) filter (where o.id is not null), 0) as cost
    from campaigns c
    left join order_lines l on l.campaign_id = c.id
    left join orders o on o.id = l.order_id and o.status not in ('pending_payment', 'cancelled')
    group by c.id, c.kind, c.title, c.active, c.ends_at, c.max_claims, c.claims_count
    order by c.created_at;
end $$;

-- ---------- Square connection ----------
-- The owner connects his own Square account with one Allow button (Square
-- OAuth; functions square-connect and square-oauth). The token lands here, where
-- NO app user can read it — RLS on, no policies; only the server (service role)
-- touches it. He disconnects from his Square dashboard at any time.
create table square_connection (
  id int primary key default 1 check (id = 1),
  merchant_id text,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  location_id text,
  location_name text,
  business_name text,
  connected_by uuid references profiles(id) on delete set null,
  connected_at timestamptz
);
alter table square_connection enable row level security;

create table square_oauth_states (
  state text primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table square_oauth_states enable row level security;

-- What the owner screen shows about it: connected or not, and into what.
-- Never the token.
create or replace function owner_square_status()
returns json language plpgsql stable security definer set search_path = public as $$
declare c square_connection%rowtype;
begin
  if not is_owner() then raise exception 'owner only'; end if;
  select * into c from square_connection where id = 1;
  return json_build_object(
    'connected',    c.access_token is not null and c.location_id is not null,
    'business',     c.business_name,
    'location',     c.location_name,
    'connectedAt',  c.connected_at,
    'paymentsOn',   (select payments_enabled from truck_status where id = 1)
  );
end $$;


-- ---------- client intake ----------
-- The onboarding form a client fills in (app/intake.tsx): his jobs with a tick
-- and notes, and the answers we need. Each client gets a row, and a private code
-- in his link (/intake?c=<code>). Nobody can list or read the table; the form
-- reads and writes its own row only through these two functions, by its code.
-- We read everything from the dashboard: select * from client_intake;
create table client_intake (
  code text primary key,
  business text not null,
  answers jsonb not null default '{}',
  jobs jsonb not null default '{}',          -- {"duns": {"done": true, "note": "requested Tue"}}
  submitted_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table client_intake enable row level security;

create or replace function get_intake(p_code text)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object('answers', answers, 'jobs', jobs, 'submittedAt', submitted_at)
  from client_intake where code = p_code;
$$;

create or replace function submit_intake(p_code text, p_answers jsonb, p_jobs jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare at timestamptz := now();
begin
  if pg_column_size(p_answers) + pg_column_size(p_jobs) > 200000 then raise exception 'too long'; end if;
  update client_intake set answers = p_answers, jobs = p_jobs, submitted_at = at, updated_at = at where code = p_code;
  if not found then raise exception 'this link is not right — ask us for a new one'; end if;
  return json_build_object('submittedAt', at);
end $$;

grant execute on function get_intake(text) to anon, authenticated;
grant execute on function submit_intake(text, jsonb, jsonb) to anon, authenticated;

insert into client_intake (code, business) values ('bp-7f3k9q', 'Buns & Patties') on conflict (code) do nothing;
