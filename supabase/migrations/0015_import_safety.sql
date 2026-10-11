-- =============================================================================
-- Kinus — 0015: imports never undo what staff did
--   * details staff change in Kinus (a nurse correcting allergies, a fixed name) are
--     remembered per field, and a later export no longer overwrites them
--   * undoing an import keeps campers it added who already checked in (they're at camp),
--     instead of archiving them out of sight; re-applying the file then just matches them
--   * walk-ins added at the gate aren't "missing from the export"
--   * archiving the campers missing from an export is part of that import, so undoing
--     the import brings them back
-- =============================================================================

alter table campers add column if not exists staff_edited text[] not null default '{}';
comment on column campers.staff_edited is 'Fields staff changed in Kinus; imports keep these values instead of the file''s.';

create or replace function campers_track_staff_edits() returns trigger
language plpgsql as $$
declare
  src text := coalesce(current_setting('kinus.audit_source', true), '');
  f text;
begin
  -- imports and their undo write these fields on purpose; everything else is a person
  if src like 'import:%' or src like 'revert:%' then return new; end if;
  foreach f in array array['first_name','last_name','grade','tshirt_size','local_address','local_address_cross_streets',
                           'medical_notes','allergies','has_allergies','has_epipen','has_medications','notes_from_parents'] loop
    if (to_jsonb(new)->f) is distinct from (to_jsonb(old)->f) and not (f = any(new.staff_edited)) then
      new.staff_edited := new.staff_edited || f;
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists campers_staff_edits on campers;
create trigger campers_staff_edits before update on campers
  for each row execute function campers_track_staff_edits();

-- ---------------------------------------------------------------------------
-- Archive campers missing from an export, recorded as part of that import
-- ---------------------------------------------------------------------------
create or replace function archive_missing(p_import_id uuid, p_camper_ids uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from imports where id = p_import_id and status::text = 'applied') then
    raise exception 'Apply the import first.';
  end if;
  perform set_config('kinus.audit_source', 'import:' || p_import_id::text, true);
  update campers c set archived_at = now()
    from imports i
    where i.id = p_import_id and c.session_id = i.session_id and c.id = any(p_camper_ids) and c.archived_at is null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function archive_missing(uuid, uuid[]) from public, anon;
grant execute on function archive_missing(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- apply_import: walk-ins (no registration id) are never marked missing
-- ---------------------------------------------------------------------------
create or replace function apply_import(p_import_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  imp imports; r import_rows; p jsonb; c jsonb; ch jsonb;
  cid uuid; did uuid; bid uuid; take_bunks boolean;
  n_added int := 0; n_updated int := 0; n_missing int := 0;
  fld text; divs text[];
begin
  if not is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into imp from imports where id = p_import_id for update;
  if imp is null then raise exception 'import not found'; end if;
  if imp.status <> 'previewed' then raise exception 'import is % — only previewed imports can be applied', imp.status; end if;
  if exists (select 1 from import_rows where import_id = p_import_id and action = 'conflict') then
    raise exception 'unresolved conflicts';
  end if;
  take_bunks := coalesce((imp.options->>'takeBunksFromFile')::boolean, false);
  perform set_config('kinus.audit_source', 'import:' || p_import_id::text, true);

  for r in select * from import_rows where import_id = p_import_id and action in ('add','update') order by row_number loop
    p := r.parsed;
    did := ensure_division(imp.session_id, p->>'division_name');
    bid := ensure_bunk(did, p->>'bunk_name');

    if r.action = 'add' then
      insert into campers (session_id, source_id, first_name, last_name, division_id, bunk_id, grade, tshirt_size,
                           bunk_preferences, local_address, local_address_cross_streets, medical_notes, allergies,
                           has_allergies, has_epipen, has_medications, notes_from_parents, source_data, in_latest_import)
      values (imp.session_id, p->>'source_id', p->>'first_name', p->>'last_name', did, bid, p->>'grade', p->>'tshirt_size',
              coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p->'bunk_preferences','[]'::jsonb)) x), '{}'),
              p->>'local_address', p->>'local_address_cross_streets', p->>'medical_notes', p->>'allergies',
              (p->>'has_allergies')::boolean, (p->>'has_epipen')::boolean, (p->>'has_medications')::boolean,
              p->>'notes_from_parents', p->'source_data', true)
      returning id into cid;
      update import_rows set matched_camper_id = cid where id = r.id;
      n_added := n_added + 1;
    else
      cid := r.matched_camper_id;
      -- apply only the fields the preview listed as changes
      for ch in select * from jsonb_array_elements(r.changes) loop
        fld := ch->>'field';
        case fld
          when 'first_name' then update campers set first_name = ch->>'new' where id = cid;
          when 'last_name' then update campers set last_name = ch->>'new' where id = cid;
          when 'division' then update campers set division_id = did, bunk_id = bid where id = cid;
          when 'bunk' then update campers set bunk_id = bid where id = cid;
          when 'grade' then update campers set grade = ch->>'new' where id = cid;
          when 'tshirt_size' then update campers set tshirt_size = ch->>'new' where id = cid;
          when 'bunk_preferences' then update campers set bunk_preferences = coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p->'bunk_preferences','[]'::jsonb)) x), '{}') where id = cid;
          when 'local_address' then update campers set local_address = ch->>'new' where id = cid;
          when 'local_address_cross_streets' then update campers set local_address_cross_streets = ch->>'new' where id = cid;
          when 'medical_notes' then update campers set medical_notes = ch->>'new' where id = cid;
          when 'allergies' then update campers set allergies = ch->>'new' where id = cid;
          when 'has_allergies' then update campers set has_allergies = (ch->>'new')::boolean where id = cid;
          when 'has_epipen' then update campers set has_epipen = (ch->>'new')::boolean where id = cid;
          when 'has_medications' then update campers set has_medications = (ch->>'new')::boolean where id = cid;
          when 'notes_from_parents' then update campers set notes_from_parents = ch->>'new' where id = cid;
          else null; -- contact[...] and source_data handled below
        end case;
      end loop;
      update campers set source_data = p->'source_data', in_latest_import = true, source_id = coalesce(source_id, p->>'source_id') where id = cid;
      n_updated := n_updated + 1;
    end if;

    if not coalesce((imp.options->>'emptyMeansUnknown')::boolean, true) then
      delete from camper_contacts where camper_id = cid and source = 'import';
    end if;
    for c in select * from jsonb_array_elements(coalesce(p->'contacts','[]'::jsonb)) loop
      if coalesce(c->>'name','') <> '' or coalesce(c->>'phone','') <> '' or coalesce(c->>'email','') <> '' then
        insert into camper_contacts (camper_id, role, slot, name, phone, phone_e164, email, is_primary, source)
        values (cid, (c->>'role')::contact_role, coalesce((c->>'slot')::int,1), c->>'name', c->>'phone', c->>'phone_e164', c->>'email',
                coalesce((c->>'is_primary')::boolean,false), 'import')
        on conflict (camper_id, role, slot) do update
          set name = excluded.name, phone = excluded.phone, phone_e164 = excluded.phone_e164, email = excluded.email, source = 'import';
      end if;
    end loop;
    update import_rows set applied = true where id = r.id;
  end loop;

  update campers set in_latest_import = true
    where id in (select matched_camper_id from import_rows where import_id = p_import_id and action = 'unchanged' and matched_camper_id is not null)
      and in_latest_import = false;

  -- campers in the file's divisions that were not in the file (walk-ins never were)
  divs := coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(imp.options->'divisionsInFile','[]'::jsonb)) x), '{}');
  update campers c set in_latest_import = false
    from divisions d
    where c.division_id = d.id and d.session_id = imp.session_id and d.name = any(divs)
      and c.archived_at is null and c.source_id is not null and c.in_latest_import
      and c.id not in (select matched_camper_id from import_rows where import_id = p_import_id and matched_camper_id is not null);
  get diagnostics n_missing = row_count;

  update imports set status = 'applied', applied_at = now(), applied_by = auth.uid(),
    summary = coalesce(summary,'{}'::jsonb) || jsonb_build_object('appliedAdded', n_added, 'appliedUpdated', n_updated, 'markedMissing', n_missing)
    where id = p_import_id;
  return jsonb_build_object('added', n_added, 'updated', n_updated, 'missing', n_missing);
end $$;

-- ---------------------------------------------------------------------------
-- revert_import: campers the import added who already checked in stay (they're at
-- camp); they're only marked "not in the latest export"
-- ---------------------------------------------------------------------------
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
        -- already checked in: keep them where everyone can see them
        update campers set in_latest_import = false where id = a.row_id;
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
          'revertRemoved', n_deleted, 'revertKeptCheckedIn', n_archived, 'revertRestored', n_restored,
          'revertKeptFields', n_kept, 'revertDivisions', n_divs, 'revertBunks', n_bunks)
    where id = p_import_id;

  return jsonb_build_object('removed', n_deleted, 'keptCheckedIn', n_archived, 'restored', n_restored,
                            'keptFields', n_kept, 'contacts', n_contacts, 'divisions', n_divs, 'bunks', n_bunks);
end $$;
