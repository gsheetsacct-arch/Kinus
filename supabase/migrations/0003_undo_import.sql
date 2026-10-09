-- =============================================================================
-- Kinus — 0003: undo an applied import (revert to the previous state)
-- =============================================================================

alter type import_status add value if not exists 'reverted';

-- Restores the fields an audited UPDATE changed, but only where the current value is
-- still what that update wrote. Fields someone changed afterwards are left alone.
-- Returns how many fields were kept for that reason.
create or replace function restore_fields(p_table text, p_row_id uuid, p_diff jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  cur jsonb;
  patch jsonb := '{}'::jsonb;
  k text;
  kept int := 0;
  gen text[];
  sets text;
begin
  execute format('select to_jsonb(t) from %I t where id = $1', p_table) into cur using p_row_id;
  if cur is null then return 0; end if;
  select coalesce(array_agg(attname::text), '{}') into gen
    from pg_attribute where attrelid = p_table::regclass and attgenerated <> '' and not attisdropped;
  for k in select jsonb_object_keys(p_diff) loop
    continue when k = any(gen) or k in ('id', 'created_at', 'updated_at');
    if cur->k is not distinct from p_diff->k->'new' then
      patch := patch || jsonb_build_object(k, p_diff->k->'old');
    else
      kept := kept + 1;
    end if;
  end loop;
  if patch = '{}'::jsonb then return kept; end if;
  select string_agg(format('%I = r.%I', key, key), ', ') into sets from jsonb_object_keys(patch) as key;
  execute format('update %I t set %s from jsonb_populate_record(null::%I, $1) r where t.id = $2', p_table, sets, p_table)
    using patch, p_row_id;
  return kept;
end $$;

-- Undoes the most recent applied import of a session using the audit trail:
-- campers it added are removed (archived instead if they already have check-ins),
-- fields it changed go back to their previous values, contacts are restored, and
-- divisions/bunks it created are removed once empty.
create or replace function revert_import(p_import_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  imp imports;
  a audit_log;
  src text := 'import:' || p_import_id::text;
  n_deleted int := 0;
  n_archived int := 0;
  n_restored int := 0;
  n_kept int := 0;
  n_contacts int := 0;
  n_divs int := 0;
  n_bunks int := 0;
begin
  if not is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into imp from imports where id = p_import_id for update;
  if imp is null then raise exception 'Import not found.'; end if;
  if imp.status::text <> 'applied' then raise exception 'Only an applied import can be undone.'; end if;
  if exists (select 1 from imports where session_id = imp.session_id and status::text = 'applied' and applied_at > imp.applied_at) then
    raise exception 'A newer import was applied after this one. Undo that one first.';
  end if;
  perform set_config('kinus.audit_source', 'revert:' || p_import_id::text, true);

  for a in select * from audit_log where source = src order by id desc loop
    if a.action = 'INSERT' and a.table_name = 'campers' then
      if exists (select 1 from attendance_events where camper_id = a.row_id) then
        update campers set archived_at = coalesce(archived_at, now()) where id = a.row_id;
        n_archived := n_archived + 1;
      else
        delete from campers where id = a.row_id;
        if found then n_deleted := n_deleted + 1; end if;
      end if;
    elsif a.action = 'INSERT' and a.table_name = 'camper_contacts' then
      delete from camper_contacts where id = a.row_id;
      if found then n_contacts := n_contacts + 1; end if;
    elsif a.action = 'UPDATE' and a.diff is not null and a.table_name in ('campers', 'camper_contacts') then
      n_kept := n_kept + restore_fields(a.table_name, a.row_id, a.diff);
      if a.table_name = 'camper_contacts' then n_contacts := n_contacts + 1; end if;
    elsif a.action = 'DELETE' and a.table_name = 'camper_contacts' then
      insert into camper_contacts select * from jsonb_populate_record(null::camper_contacts, a.before) on conflict do nothing;
      n_contacts := n_contacts + 1;
    end if;
  end loop;

  select count(distinct row_id) into n_restored from audit_log
    where source = src and table_name = 'campers' and action = 'UPDATE';

  -- divisions and bunks created by this import (same transaction timestamp), once empty
  delete from bunks b using divisions d
    where b.division_id = d.id and d.session_id = imp.session_id and b.created_at = imp.applied_at
      and not exists (select 1 from campers c where c.bunk_id = b.id)
      and not exists (select 1 from staff_scopes s where s.bunk_id = b.id);
  get diagnostics n_bunks = row_count;
  delete from divisions d
    where d.session_id = imp.session_id and d.created_at = imp.applied_at
      and not exists (select 1 from campers c where c.division_id = d.id)
      and not exists (select 1 from bunks b where b.division_id = d.id)
      and not exists (select 1 from staff_scopes s where s.division_id = d.id);
  get diagnostics n_divs = row_count;

  update import_rows set applied = false where import_id = p_import_id;
  update imports
    set status = 'reverted',
        summary = coalesce(summary, '{}'::jsonb) || jsonb_build_object(
          'revertedAt', now(), 'revertedBy', auth.uid(),
          'revertRemoved', n_deleted, 'revertArchived', n_archived, 'revertRestored', n_restored,
          'revertKeptFields', n_kept, 'revertDivisions', n_divs, 'revertBunks', n_bunks)
    where id = p_import_id;

  return jsonb_build_object('removed', n_deleted, 'archived', n_archived, 'restored', n_restored,
                            'keptFields', n_kept, 'contacts', n_contacts, 'divisions', n_divs, 'bunks', n_bunks);
end $$;
