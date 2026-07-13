create table if not exists public.cpwi_status (
  station text primary key,
  updated_at timestamptz not null default now(),
  online boolean not null default false,
  payload jsonb,
  last_error text
);

create table if not exists public.cpwi_commands (
  id uuid primary key default gen_random_uuid(),
  station text not null default 'eliot',
  action text not null check (action in ('connect','disconnect','trackingOn','trackingOff','park','unpark','abortSlew')),
  status text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  result jsonb,
  error text
);
create index if not exists cpwi_commands_pending_idx on public.cpwi_commands(station,status,requested_at);

alter table public.cpwi_status enable row level security;
alter table public.cpwi_commands enable row level security;

grant usage on schema public to anon, authenticated, service_role;
grant select on public.cpwi_status to anon, authenticated;
grant all on public.cpwi_status to service_role;
grant select, insert on public.cpwi_commands to authenticated;
grant all on public.cpwi_commands to service_role;

create policy "cpwi status readable" on public.cpwi_status for select to anon, authenticated using (true);
create policy "crew can create cpwi commands" on public.cpwi_commands for insert to authenticated with check (auth.uid() = requested_by);
create policy "crew can read own cpwi commands" on public.cpwi_commands for select to authenticated using (auth.uid() = requested_by);

-- Optional cleanup: removes completed/failed commands older than 24 hours each hour.
create extension if not exists pg_cron with schema extensions;
select cron.unschedule(jobid) from cron.job where jobname='delete-old-cpwi-commands';
select cron.schedule('delete-old-cpwi-commands','23 * * * *', $$delete from public.cpwi_commands where status in ('completed','failed') and completed_at < now() - interval '24 hours';$$);
