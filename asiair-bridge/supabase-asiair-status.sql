-- CuzBro ASIAIR live feed telemetry
-- Safe to run more than once.

create table if not exists public.asiair_status (
  station text primary key,
  updated_at timestamptz not null default now(),
  online boolean not null default false,
  payload jsonb,
  last_error text
);

alter table public.asiair_status enable row level security;

insert into storage.buckets (id, name, public)
values ('asiair-previews', 'asiair-previews', true)
on conflict (id) do update set public = true;

grant select on public.asiair_status to authenticated;
grant all on public.asiair_status to service_role;

drop policy if exists "authenticated crew can read ASIAIR status" on public.asiair_status;
create policy "authenticated crew can read ASIAIR status"
  on public.asiair_status
  for select
  to authenticated
  using (true);

-- The website no longer reads public.asiimg_status. After confirming the new
-- bridge is online, the obsolete table may be removed manually with:
-- drop table if exists public.asiimg_status;

select 'ASIAIR telemetry table installed successfully' as status;

-- Android-app capture command queue used by the website and local ADB bridge.
create table if not exists public.asiair_commands (
  id uuid primary key default gen_random_uuid(),
  station text not null default 'eliot',
  action text not null check (action in ('capture', 'capture_preview', 'start_autorun', 'stop_capture', 'set_mode', 'set_gain', 'set_exposure', 'configure_autorun', 'plate_solve', 'toggle_continuous_preview')),
  arguments jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  requested_by uuid null,
  created_at timestamptz not null default now(),
  started_at timestamptz null,
  completed_at timestamptz null,
  success boolean null,
  result jsonb null,
  error text null
);


-- Expand the action constraint when upgrading an existing installation.
do $$
begin
  alter table public.asiair_commands drop constraint if exists asiair_commands_action_check;
  alter table public.asiair_commands add constraint asiair_commands_action_check
    check (action in ('capture', 'capture_preview', 'start_autorun', 'stop_capture', 'set_mode', 'set_gain', 'set_exposure', 'configure_autorun', 'plate_solve', 'toggle_continuous_preview'));
end $$;

create index if not exists asiair_commands_station_status_created_idx
  on public.asiair_commands (station, status, created_at);

alter table public.asiair_commands enable row level security;
grant select, insert on public.asiair_commands to authenticated;
grant all on public.asiair_commands to service_role;

drop policy if exists "authenticated crew can queue ASIAIR commands" on public.asiair_commands;
create policy "authenticated crew can queue ASIAIR commands"
  on public.asiair_commands
  for insert
  to authenticated
  with check (auth.uid() = requested_by);

drop policy if exists "authenticated crew can read ASIAIR commands" on public.asiair_commands;
create policy "authenticated crew can read ASIAIR commands"
  on public.asiair_commands
  for select
  to authenticated
  using (auth.uid() = requested_by);

notify pgrst, 'reload schema';
