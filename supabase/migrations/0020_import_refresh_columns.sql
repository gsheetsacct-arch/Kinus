-- =============================================================================
-- Kinus — 0020: an import refreshes the registration columns (source_data) of every
-- camper in the file, not only those with changes to show. Before, a column added
-- to the export (e.g. ppa.yarmulka_size for the labels) stayed empty for campers
-- whose other details were the same. Undo (revert_import) restores them as before.
-- =============================================================================

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

  -- campers with no changes to show still take the file's columns as they are now: a column
  -- added to the export (ppa.yarmulka_size…) reaches everyone, not only campers that changed
  update campers c set in_latest_import = true, source_data = coalesce(ir.parsed->'source_data', c.source_data)
    from import_rows ir
    where ir.import_id = p_import_id and ir.action = 'unchanged' and ir.matched_camper_id = c.id
      and (c.in_latest_import = false or c.source_data is distinct from coalesce(ir.parsed->'source_data', c.source_data));

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
