-- =============================================================================
-- Kinus — 0052: a full activity log
--   Every change to camp's data is written to audit_log, with who made it and where:
--   1. More tables are logged: sessions, camps, divisions and bunks, staff (added and
--      removed too), roles and who sees what, settings, templates and fields, lists,
--      imports, print requests, texts, head counts, follow-ups, buzzers.
--   2. Changes Kinus' server makes for someone (with its own key, after checking they're
--      allowed) are put down to that person: the app sends who it is in a request header
--      (x-kinus-actor), which only the server's key can make count. Before, those showed
--      no one.
--   3. Where on the site it was done (x-kinus-via: the page), and a short note for things
--      that aren't a change of data (a download, a sign-in): table_name 'app'.
--   4. Rows without a uuid id (settings, roles, who-sees-what) are logged by their key.
-- =============================================================================

alter table audit_log add column if not exists row_key text;
alter table audit_log add column if not exists via text;
create index if not exists audit_log_at on audit_log (at desc, id desc);
create index if not exists audit_log_actor on audit_log (actor_id, at desc);
create index if not exists audit_log_table_at on audit_log (table_name, at desc);

-- who: the signed-in person, else whom the server says it's acting for (its key only)
create or replace function audit_actor() returns uuid
language plpgsql stable as $$
declare h text;
begin
  if auth.uid() is not null then return auth.uid(); end if;
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::json->>'role', '') <> 'service_role' then return null; end if;
  h := nullif(current_setting('request.headers', true), '');
  if h is null then return null; end if;
  h := h::json->>'x-kinus-actor';
  if h ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return h::uuid; end if;
  return null;
exception when others then return null;
end $$;

create or replace function audit_via() returns text
language plpgsql stable as $$
declare h text;
begin
  h := nullif(current_setting('request.headers', true), '');
  if h is null then return null; end if;
  return left(h::json->>'x-kinus-via', 200);
exception when others then return null;
end $$;

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

-- staff added and removed, not only changed
drop trigger if exists profiles_audit on profiles;
create trigger profiles_audit after insert or update or delete on profiles for each row execute function audit_trigger();
drop trigger if exists buzzer_assignments_audit on buzzer_assignments;
create trigger buzzer_assignments_audit after insert or update or delete on buzzer_assignments for each row execute function audit_trigger();

-- every other table people change (not the big ones that are logs or copies themselves:
-- import rows, the campers on a print request, texts' recipients and replies, check-ins,
-- which each camper's own change already shows)
do $$
declare t text;
begin
  foreach t in array array['sessions','division_groups','divisions','bunks','buzzers','camper_followups',
                           'field_visibility','role_access','settings','list_presets','merge_fields',
                           'value_maps','value_map_entries','print_templates','print_jobs','imports',
                           'import_mappings','head_counts','head_count_marks','text_broadcasts',
                           'text_opt_outs','update_signups','page_requests'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists %I on %I', t || '_audit', t);
      execute format('create trigger %I after insert or update or delete on %I for each row execute function audit_trigger()', t || '_audit', t);
    end if;
  end loop;
end $$;

revoke execute on function audit_actor() from public, anon;
revoke execute on function audit_via() from public, anon;
