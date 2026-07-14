-- Run once in the Supabase SQL editor.
create table if not exists public.focuser_status (
  station text primary key,
  updated_at timestamptz not null default now(),
  online boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  last_error text
);

create table if not exists public.focuser_commands (
  id uuid primary key default gen_random_uuid(),
  station text not null default 'eliot',
  action text not null,
  arguments jsonb,
  status text not null default 'queued' check (status in ('queued','processing','completed','failed')),
  requested_by uuid,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  result jsonb,
  error text
);

create index if not exists focuser_commands_queue_idx
  on public.focuser_commands (station, status, requested_at);

alter table public.focuser_status enable row level security;
alter table public.focuser_commands enable row level security;

-- Signed-in crew can read telemetry and queue commands.
drop policy if exists "authenticated read focuser status" on public.focuser_status;
create policy "authenticated read focuser status"
  on public.focuser_status for select to authenticated using (true);

drop policy if exists "authenticated read focuser commands" on public.focuser_commands;
create policy "authenticated read focuser commands"
  on public.focuser_commands for select to authenticated using (true);

drop policy if exists "authenticated queue focuser commands" on public.focuser_commands;
create policy "authenticated queue focuser commands"
  on public.focuser_commands for insert to authenticated
  with check (requested_by = auth.uid());

-- The bridge uses the service-role key and therefore bypasses RLS for updates.
