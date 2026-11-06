-- =============================================================================
-- Kinus — 0068: less disk work for the database (Supabase warned the Disk IO budget is running out)
--   * The activity log (audit_trigger, as in 0052) kept two whole copies of a row on every
--     change: a check-in (the camper's status) stored the camper's full registration row
--     (source_data, source_fixes…) twice. On a change, a big value that didn't change
--     (over 200 characters) is now left out of the two copies; what changed is still kept in
--     full (diff), and the names, ids and small fields the Activity page shows stay.
--     Added and removed rows are kept whole, as before (undo needs them).
--   * An index for "what changed since" (every open check-in and check-out screen asks every
--     few seconds), so it doesn't read every camper of the session.
-- Safe to run again.
-- =============================================================================

create or replace function audit_trigger() returns trigger language plpgsql security definer set search_path = public as $$
declare
  b jsonb; a jsonb; v jsonb; d jsonb := '{}'::jsonb; k text; idtxt text; rid uuid; rkey text;
  uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if tg_op <> 'INSERT' then b := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then a := to_jsonb(new); end if;
  v := coalesce(a, b);
  -- the design connector's sign-ins mark when each was last used: not a change anyone made
  if tg_table_name = 'settings' and v->>'key' = 'design_connectors' and tg_op = 'UPDATE' then return null; end if;
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(a) loop
      if a->k is distinct from b->k and k not in ('updated_at') then
        d := d || jsonb_build_object(k, jsonb_build_object('old', b->k, 'new', a->k));
      end if;
    end loop;
    if d = '{}'::jsonb then return null; end if;
    -- the copies without the big values that didn't change (the diff has what did)
    for k in select jsonb_object_keys(a) loop
      if a->k is not distinct from b->k and length((a->k)::text) > 200 then
        a := a - k;
        b := b - k;
      end if;
    end loop;
  end if;
  -- the row: its uuid id; else whose it is (a follow-up is a camper's); else its key
  idtxt := coalesce(v->>'id', v->>'camper_id');
  if idtxt ~* uuid_re then rid := idtxt::uuid; end if;
  rkey := coalesce(v->>'key', v->>'role', v->>'field_group', v->>'phone_e164',
                   case when rid is null then left(coalesce(v->>'head_count_id', v->>'map_id', v->>'session_id', ''), 80) end);
  insert into audit_log (actor_id, source, table_name, row_id, row_key, action, before, after, diff, via)
  values (audit_actor(),
          coalesce(nullif(current_setting('kinus.audit_source', true), ''), 'ui'),
          tg_table_name, rid, nullif(rkey, ''), tg_op, b, a, nullif(d, '{}'::jsonb), audit_via());
  return null;
end $$;

create index if not exists campers_session_updated on campers (session_id, updated_at);
