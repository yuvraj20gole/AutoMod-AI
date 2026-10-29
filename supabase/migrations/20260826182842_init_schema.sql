-- AutoMod AI — initial schema: profiles, cars, builds.
--
-- Car-owners-only v1 (see CLAUDE-2.md "Auth & dashboard"). `builds` exists
-- as a table now but stays empty until the AI engine (separate Sem 7 phase)
-- can actually generate before/after previews.
--
-- Every table has Row Level Security enabled with owner-only policies —
-- enforced by Postgres itself, not just application code, so a leaked
-- anon key can't be used to read or write another user's rows.

-- ---------------------------------------------------------------------
-- profiles — one row per auth.users row, created automatically on signup
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Insert is handled by the trigger below (security definer), not by the
-- client directly, so no insert policy is needed for normal use.

-- Auto-create a profile row whenever a new auth user is created, pulling
-- the display name from the signup metadata set in app/register/page.tsx
-- (`options.data.full_name`).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- cars — a user's saved vehicles
-- ---------------------------------------------------------------------
create table if not exists public.cars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  make text not null,
  model text not null,
  year integer,
  photo_url text,
  created_at timestamptz not null default now()
);

create index if not exists cars_user_id_idx on public.cars(user_id);

alter table public.cars enable row level security;

create policy "Users can view their own cars"
  on public.cars for select
  using (auth.uid() = user_id);

create policy "Users can insert their own cars"
  on public.cars for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own cars"
  on public.cars for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own cars"
  on public.cars for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- builds — AI-generated mod previews for a car. Table structure only for
-- now; no AI integration yet, so rows won't exist in practice until the
-- separate AI engine phase lands. user_id is denormalized from cars.user_id
-- so RLS here doesn't need a join back to cars on every check.
-- ---------------------------------------------------------------------
create table if not exists public.builds (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null references public.cars(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  mod_category text,
  before_image_url text,
  after_image_url text,
  params jsonb,
  created_at timestamptz not null default now()
);

create index if not exists builds_user_id_idx on public.builds(user_id);
create index if not exists builds_car_id_idx on public.builds(car_id);

alter table public.builds enable row level security;

create policy "Users can view their own builds"
  on public.builds for select
  using (auth.uid() = user_id);

create policy "Users can insert their own builds"
  on public.builds for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own builds"
  on public.builds for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own builds"
  on public.builds for delete
  using (auth.uid() = user_id);
