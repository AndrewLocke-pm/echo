
/*
# Revoke anonymous execution from trigger functions

## Summary
Revokes EXECUTE from anon and public on the two SECURITY DEFINER trigger
functions that previously granted it by default. This eliminates the
"anonymous execution of security-definer functions" warning.

## Rationale
- `handle_new_user` is a trigger on auth.users; it fires during signup
  but is invoked by the database trigger system, not by direct anon RPC.
- `validate_profile_default_workspace` is a BEFORE INSERT/UPDATE trigger
  on profiles; also invoked by the trigger system, not direct anon RPC.
- Neither needs to be callable by anon. Revoking EXECUTE from anon and
  public follows least-privilege. authenticated and service_role retain
  EXECUTE for completeness; postgres always has implicit access.

## Changes
- REVOKE EXECUTE ON handle_new_user FROM PUBLIC, anon
- REVOKE EXECUTE ON validate_profile_default_workspace FROM PUBLIC, anon
*/

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;

REVOKE EXECUTE ON FUNCTION public.validate_profile_default_workspace() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_profile_default_workspace() FROM anon;
