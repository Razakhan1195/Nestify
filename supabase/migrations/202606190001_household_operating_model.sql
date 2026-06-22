-- Sprint 1: Household operating model provider categories.
-- Safe to run in Supabase SQL Editor.

insert into public.provider_categories (name)
values
  ('Rent / landlord'),
  ('Other service')
on conflict (name) do nothing;

notify pgrst, 'reload schema';
