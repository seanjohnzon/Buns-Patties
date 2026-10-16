-- The three SIT logins, one per role, for a test project (never UAT). The test
-- app signs in with one tap (app/auth.tsx, EXPO_PUBLIC_ENV=sit): no phone
-- provider, no Twilio, no code. Run in the SQL editor after schema.sql, once.
-- The password is the one in the branch's .env (EXPO_PUBLIC_SIT_LOGIN_PASSWORD).
--
-- Two statements, not one: the profile rows are made by the sign-up trigger
-- while the first statement runs, so the second one has to come after it.

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token, is_sso_user, is_anonymous)
select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', v.email,
  extensions.crypt('BunsSIT-2026', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('name', v.name), now(), now(),
  '', '', '', '', '', '', '', '', false, false
from (values ('owner@buns.test', 'Serdar'), ('staff@buns.test', 'Kitchen'), ('customer@buns.test', 'Customer')) as v(email, name);

insert into auth.identities (user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select id, id::text, 'email', jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), now(), now(), now()
from auth.users where email like '%@buns.test';

update profiles p set
  name = u.raw_user_meta_data->>'name',
  role = case u.email when 'owner@buns.test' then 'owner'::app_role when 'staff@buns.test' then 'staff'::app_role else 'customer'::app_role end
from auth.users u where p.id = u.id and u.email like '%@buns.test';

-- Check: each signs in over the API (200 and a token):
--   POST {project}/auth/v1/token?grant_type=password  {"email":"owner@buns.test","password":"…"}
