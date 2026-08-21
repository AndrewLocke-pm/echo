
/*
# Harden system trigger functions

## Summary
Updates set_updated_at and handle_new_user trigger functions to use
empty search_path, preventing search_path hijacking attacks on these
SECURITY DEFINER functions.

## Changes
- set_updated_at: add SET search_path = '' (pure function, no table access)
- handle_new_user: add SET search_path = '', use fully qualified public.profiles
*/

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
