alter table public.volunteer_profiles
  add column if not exists bio text,
  add column if not exists skills text,
  add column if not exists area text;
