-- Run this once in the Supabase SQL editor. Everything the app needs.

create extension if not exists pgcrypto;

-- ---------- profiles + points ----------
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
  points int not null default 0,
  role app_role not null default 'customer',
  stripe_customer_id text,
  expo_push_token text,
  created_at timestamptz default now()
);

create table points_ledger (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  delta int not null,
  reason text not null,            -- signup | order | walkup | redeem | birthday | manual
  order_id uuid,
  amount numeric(10,2),
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

-- signup bonus + profile row on new auth user
-- No signup bonus: the welcome drink is earned by following or reviewing,
-- not given away for installing.
create or replace function handle_new_user() returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, phone) values (new.id, new.phone);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- keep profiles.points in sync with the ledger
create or replace function apply_ledger() returns trigger language plpgsql security definer as $$
begin
  update profiles set points = points + new.delta where id = new.user_id;
  return new;
end $$;
create trigger on_ledger_insert after insert on points_ledger for each row execute function apply_ledger();

-- Points are only ever awarded by the order trigger, after Stripe confirms the
-- money. There is deliberately no way for staff to hand out points by hand.

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
  featured boolean not null default false,
  available boolean not null default true,
  sold_out_until date,                            -- staff flip this when they run out
  sort int not null default 0
);

create table rewards (
  id text primary key,
  name text not null,
  points_cost int not null,
  image_url text,
  menu_item_id text references menu_items(id)
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
  -- Off until Stripe has approved the owner and we have connected it. While off,
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
  discount numeric(10,2) not null default 0,
  total numeric(10,2) not null,
  redeem_points int not null default 0,
  points_earned int not null default 0,
  pickup_at timestamptz,
  pickup_name text,               -- called out at the window, DoorDash style
  stripe_payment_intent text unique,
  stripe_checkout_session text unique,   -- web path
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
  note text
);

-- When Stripe webhook flips status to 'received': award points, deduct redeemed points.
create or replace function on_order_paid() returns trigger language plpgsql security definer as $$
begin
  if old.status = 'pending_payment' and new.status = 'received' then
    new.points_earned := floor(new.subtotal * 5);  -- 5% back, see lib/points.ts
    insert into points_ledger (user_id, delta, reason, order_id, amount) values (new.user_id, new.points_earned, 'order', new.id, new.subtotal);
    if new.redeem_points > 0 then
      insert into points_ledger (user_id, delta, reason, order_id) values (new.user_id, -new.redeem_points, 'redeem', new.id);
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger on_order_status before update on orders for each row execute function on_order_paid();

-- ---------- RLS ----------
alter table profiles enable row level security;
alter table points_ledger enable row level security;
alter table orders enable row level security;
alter table order_lines enable row level security;
alter table categories enable row level security;
alter table menu_items enable row level security;
alter table rewards enable row level security;
alter table truck_status enable row level security;

create policy "public read menu" on categories for select using (true);
create policy "public read items" on menu_items for select using (true);
create policy "public read rewards" on rewards for select using (true);
create policy "public read status" on truck_status for select using (true);

create policy "own profile" on profiles for select using (id = auth.uid() or is_staff());
create policy "update own profile" on profiles for update using (id = auth.uid());
-- Only the owner may change anyone's role, and never their own (no self-demotion
-- locking the truck out, no staff promoting themselves).
create policy "owner sets roles" on profiles for update using (is_owner() and id <> auth.uid());
create policy "own ledger" on points_ledger for select using (user_id = auth.uid());

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
      sum(case when created_at >= today_start then subtotal - discount end)          as net_today,
      sum(case when created_at >= today_start then tip end)                          as tips_today,
      count(*) filter (where created_at >= today_start)                              as orders_today,
      sum(case when created_at >= today_start then discount end)                     as discount_today,
      -- the same slice of the day, one week ago (Toast's day-over-day comparison)
      sum(case when created_at >= today_start - interval '7 days'
                and created_at < today_start - interval '7 days' + (now() - today_start)
               then subtotal - discount end)                                         as net_last_week,
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

-- Outstanding points are money you owe. Easy to forget it is a liability.
create or replace function owner_rewards()
returns json language plpgsql stable security definer set search_path = public as $$
declare result json;
begin
  if not is_owner() then raise exception 'owner only'; end if;
  select json_build_object(
    'pointsOutstanding', coalesce((select sum(points) from profiles), 0),
    'members',           (select count(*) from profiles where role = 'customer'),
    'newThisWeek',       (select count(*) from profiles where created_at >= now() - interval '7 days'),
    'redeemedThisWeek',  coalesce((select -sum(delta) from points_ledger
                                    where reason = 'redeem' and created_at >= now() - interval '7 days'), 0)
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
-- Every Stripe event we are handed, kept so a failure is visible rather than
-- silent. The primary key is Stripe's own event id, which makes replays safe.
create table webhook_events (
  id text primary key,            -- Stripe event id, or reconcile-<ts>
  type text not null,
  received_at timestamptz not null default now(),
  handled_at timestamptz,         -- null = we never finished it
  error text
);

alter table webhook_events enable row level security;
create policy "owner reads webhook events" on webhook_events for select using (is_owner());

-- Orders that took money but never reached the kitchen. Should always be empty.
-- The staff screen shows these so a human catches what automation missed.
create or replace function stuck_orders()
returns table (id uuid, created_at timestamptz, total numeric, stripe_payment_intent text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'staff only'; end if;
  return query
    select o.id, o.created_at, o.total, o.stripe_payment_intent
    from orders o
    where o.status = 'pending_payment'
      and o.stripe_payment_intent is not null
      and o.created_at < now() - interval '5 minutes'
      and o.created_at > now() - interval '2 days'
    order by o.created_at;
end $$;

-- ---------- campaigns ----------
-- Everything we give away is a campaign, including the free drink on the sticker.
-- The owner makes the rest: "like the post", "share the reel", whatever he wants.
--
-- Nothing anyone gives away here can be verified — Instagram and Google will not
-- tell an app who followed, liked or reviewed. So the controls are not "did they
-- really do it", they are: ONE claim per account (a phone number that had to
-- receive a text), a HARD CAP on total claims, and an END DATE. Worst case is
-- known before it starts: max_claims x what it costs you.
create table campaigns (
  id text primary key,
  title text not null,                       -- "Free drink on us"
  blurb text,                                -- shown under the title
  -- Any ONE of these unlocks it: [{"id":"ig","label":"Follow us","url":"https://..."}]
  actions jsonb not null default '[]',
  reward_item_id text references menu_items(id),
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

alter table campaigns enable row level security;
alter table campaign_claims enable row level security;

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


-- The one campaign that ships with the app: the drink printed on the sticker.
-- Everything after this the owner makes himself.
insert into campaigns (id, title, blurb, actions, reward_item_id, max_claims) values (
  'welcome_drink',
  'Free drink',
  'On us, for your first order',
  '[{"id":"follow_instagram","label":"Follow us on Instagram","url":"https://www.instagram.com/buns.patties"},
    {"id":"google_review","label":"Leave a Google review","url":"https://maps.google.com/?cid=559877457463287649"}]'::jsonb,
  'can_drink',
  1000            -- a known ceiling: 1000 drinks, then it stops on its own
);

-- What each campaign has actually cost, for the owner screen.
create or replace function owner_campaigns()
returns table (
  id text, title text, active boolean, ends_at timestamptz,
  max_claims int, claims_count int, used_count bigint, cost numeric
) language plpgsql stable security definer set search_path = public as $$
begin
  if not is_owner() then raise exception 'owner only'; end if;
  return query
    select c.id, c.title, c.active, c.ends_at, c.max_claims, c.claims_count,
           count(cc.used_at) as used_count,
           coalesce(count(cc.used_at) * mi.price, 0) as cost
    from campaigns c
    left join campaign_claims cc on cc.campaign_id = c.id
    left join menu_items mi on mi.id = c.reward_item_id
    group by c.id, c.title, c.active, c.ends_at, c.max_claims, c.claims_count, mi.price
    order by c.created_at desc;
end $$;
