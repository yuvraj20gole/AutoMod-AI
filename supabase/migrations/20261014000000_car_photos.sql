-- AutoMod AI — multiple photos per car, one per viewing angle.
-- cars.photo_url stays as the primary/thumbnail photo; car_photos holds all of them.

create table if not exists public.car_photos (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null references public.cars(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  angle text not null check (angle in ('front_34','front','side','rear_34','rear')),
  storage_path text not null,
  created_at timestamptz not null default now(),
  unique (car_id, angle)
);

create index if not exists car_photos_car_id_idx on public.car_photos(car_id);
create index if not exists car_photos_user_id_idx on public.car_photos(user_id);

alter table public.car_photos enable row level security;

create policy "Users can view their own car photos rows"
  on public.car_photos for select using (auth.uid() = user_id);
create policy "Users can insert their own car photos rows"
  on public.car_photos for insert with check (auth.uid() = user_id);
create policy "Users can update their own car photos rows"
  on public.car_photos for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their own car photos rows"
  on public.car_photos for delete using (auth.uid() = user_id);

-- Backfill: every existing car's single photo becomes its front 3/4 photo.
insert into public.car_photos (car_id, user_id, angle, storage_path)
select id, user_id, 'front_34', photo_url from public.cars where photo_url is not null
on conflict (car_id, angle) do nothing;
