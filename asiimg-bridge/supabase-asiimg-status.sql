-- CuzBro ASIImg live capture telemetry
-- Safe to run more than once.

create table if not exists public.asiimg_status (
  station text primary key,
  updated_at timestamptz not null default now(),
  online boolean not null default false,
  payload jsonb,
  last_error text
);

alter table public.asiimg_status enable row level security;

grant select on public.asiimg_status to authenticated;
grant all on public.asiimg_status to service_role;

drop policy if exists "authenticated crew can read ASIImg status" on public.asiimg_status;
create policy "authenticated crew can read ASIImg status"
  on public.asiimg_status
  for select
  to authenticated
  using (true);

select 'ASIImg telemetry table installed successfully' as status;
