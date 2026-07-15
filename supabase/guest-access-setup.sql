-- Run once in the Supabase SQL editor after creating guest@cuzbro.net
-- in Authentication > Users. Dave, Justin, and Chappy are full admins.

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
where lower(email) in (
  'dve.hffman@gmail.com',
  'jhoff33@gmail.com',
  'gregg@computerav.com'
);

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"guest"}'::jsonb
where lower(email) = 'guest@cuzbro.net';

-- Helper functions for RLS policies.
create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'none');
$$;

grant execute on function public.current_app_role() to authenticated;

create or replace function public.is_cuzbro_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() = 'admin';
$$;

grant execute on function public.is_cuzbro_admin() to authenticated;

-- Apply the following pattern to each admin-visible table that has RLS enabled.
-- Replace TABLE_NAME, and use unique policy names for each table.
--
-- create policy "authenticated users can view TABLE_NAME"
-- on public.TABLE_NAME for select
-- to authenticated
-- using (public.current_app_role() in ('admin', 'guest'));
--
-- create policy "admins can insert TABLE_NAME"
-- on public.TABLE_NAME for insert
-- to authenticated
-- with check (public.is_cuzbro_admin());
--
-- create policy "admins can update TABLE_NAME"
-- on public.TABLE_NAME for update
-- to authenticated
-- using (public.is_cuzbro_admin())
-- with check (public.is_cuzbro_admin());
--
-- create policy "admins can delete TABLE_NAME"
-- on public.TABLE_NAME for delete
-- to authenticated
-- using (public.is_cuzbro_admin());
