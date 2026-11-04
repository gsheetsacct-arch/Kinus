-- =============================================================================
-- Kinus — 0058: undoing a big import doesn't time out
--   * The Undo button called revert_import as the signed-in person, whose requests stop after a
--     few seconds: undoing an import that changed hundreds of campers (2,500 changes, 850
--     contacts) timed out and nothing was undone. revert_import_for runs the same undo from the
--     server (service role, no short time limit), for the person who pressed Undo: it checks
--     they're an owner or a director over all of camp, and the undo runs as them (the same
--     check inside, and the activity log names them). Only the server may call it.
-- =============================================================================

create or replace function revert_import_for(p_import_id uuid, p_actor uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = p_actor and is_active and (role = 'owner' or (role = 'director' and all_areas))) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- as that person, for revert_import's own check (is_admin) and the activity log
  perform set_config('request.jwt.claim.sub', p_actor::text, true);
  return revert_import(p_import_id);
end $$;

revoke all on function revert_import_for(uuid, uuid) from public, anon, authenticated;
grant execute on function revert_import_for(uuid, uuid) to service_role;
