-- AutoMod AI — car-photos storage bucket + RLS.
--
-- Private bucket (not public): a photo is only ever served via a signed
-- URL generated server-side for the owning user, matching the same
-- owner-only pattern as the `cars`/`builds` table policies. Objects are
-- stored at `{user_id}/{filename}`, so `(storage.foldername(name))[1]`
-- gives the owning user's id for the RLS check below.

insert into storage.buckets (id, name, public)
values ('car-photos', 'car-photos', false)
on conflict (id) do nothing;

create policy "Users can view their own car photos"
  on storage.objects for select
  using (
    bucket_id = 'car-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can upload their own car photos"
  on storage.objects for insert
  with check (
    bucket_id = 'car-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can update their own car photos"
  on storage.objects for update
  using (
    bucket_id = 'car-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'car-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete their own car photos"
  on storage.objects for delete
  using (
    bucket_id = 'car-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
