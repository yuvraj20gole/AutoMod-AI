-- Two-engine support: edit_jobs queue + engine column on builds.
-- Do not edit older migrations; this file is additive only.

-- ---------------------------------------------------------------------
-- builds.engine — which model produced the preview (default Fast)
-- ---------------------------------------------------------------------
alter table public.builds
  add column if not exists engine text not null default 'fast';

alter table public.builds
  drop constraint if exists builds_engine_check;

alter table public.builds
  add constraint builds_engine_check check (engine in ('fast', 'detailed'));

create index if not exists builds_engine_idx on public.builds(engine);

-- ---------------------------------------------------------------------
-- edit_jobs — async Detailed (and future) edit queue, RLS owner-only
-- ---------------------------------------------------------------------
create table if not exists public.edit_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  car_id uuid not null references public.cars(id) on delete cascade,
  engine text not null check (engine in ('fast', 'detailed')),
  part text,
  option text,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'done', 'failed')),
  error text,
  result_path text,
  build_id uuid references public.builds(id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index if not exists edit_jobs_user_id_idx on public.edit_jobs(user_id);
create index if not exists edit_jobs_status_idx on public.edit_jobs(status);
create index if not exists edit_jobs_car_id_idx on public.edit_jobs(car_id);

alter table public.edit_jobs enable row level security;

create policy "Users can view their own edit jobs"
  on public.edit_jobs for select
  using (auth.uid() = user_id);

create policy "Users can insert their own edit jobs"
  on public.edit_jobs for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own edit jobs"
  on public.edit_jobs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own edit jobs"
  on public.edit_jobs for delete
  using (auth.uid() = user_id);
