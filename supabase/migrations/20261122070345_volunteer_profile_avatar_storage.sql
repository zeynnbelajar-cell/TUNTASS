alter table public.volunteer_profiles add column if not exists avatar_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('volunteer-avatars', 'volunteer-avatars', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 3145728, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists volunteer_avatar_public_read on storage.objects;
create policy volunteer_avatar_public_read on storage.objects
  for select using (bucket_id = 'volunteer-avatars');

drop policy if exists volunteer_avatar_owner_insert on storage.objects;
create policy volunteer_avatar_owner_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'volunteer-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists volunteer_avatar_owner_update on storage.objects;
create policy volunteer_avatar_owner_update on storage.objects
  for update to authenticated
  using (bucket_id = 'volunteer-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'volunteer-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists volunteer_avatar_owner_delete on storage.objects;
create policy volunteer_avatar_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'volunteer-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
