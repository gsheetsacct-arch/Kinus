-- =============================================================================
-- Kinus — 0002: auth profile sync, import apply, realtime, defaults
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Profiles follow auth.users. Invites carry full_name / global_role in metadata.
-- ---------------------------------------------------------------------------
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r global_role := 'staff';
  bootstrap text;
begin
  select value->>'email' into bootstrap from settings where key = 'bootstrap_owner';
  if bootstrap is not null and lower(new.email) = lower(bootstrap) then
    r := 'owner';
  elsif (new.raw_user_meta_data->>'global_role') is not null then
    r := (new.raw_user_meta_data->>'global_role')::global_role;
  end if;
  insert into profiles (id, email, full_name, global_role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), r)
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Replace the self-referencing self-update policy with a plain one + guard trigger.
drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create or replace function profiles_guard() returns trigger language plpgsql as $$
begin
  if (new.global_role is distinct from old.global_role or new.is_active is distinct from old.is_active)
     and not is_admin() and current_user <> 'postgres' and current_user <> 'service_role' then
    raise exception 'only admins may change role or active state' using errcode = '42501';
  end if;
  if old.global_role = 'owner' and new.global_role <> 'owner' and my_role() <> 'owner'
     and current_user not in ('postgres', 'service_role') then
    raise exception 'only an owner may demote an owner' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard on profiles;
create trigger profiles_guard before update on profiles for each row execute function profiles_guard();

-- Admins may create sessions/divisions/bunks via the app; directors may read everything.
-- (policies already exist in 0001)

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table attendance_events, campers, print_jobs, page_requests, imports;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Import apply: one transaction over the previewed rows.
-- Expects import_rows.parsed = {
--   source_id, first_name, last_name, division_name, bunk_name, grade, tshirt_size,
--   bunk_preferences[], local_address, local_address_cross_streets, medical_notes,
--   allergies, has_allergies, has_epipen, has_medications, notes_from_parents,
--   contacts: [{role, slot, name, phone, phone_e164, email}], source_data: {...}
-- } and import_rows.changes = [{field, old, new}] for action = 'update'.
-- options.takeBunksFromFile, options.divisionsInFile[] on imports.options.
-- ---------------------------------------------------------------------------
create or replace function ensure_division(p_session_id uuid, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare d uuid; lang division_language;
begin
  if p_name is null or btrim(p_name) = '' then return null; end if;
  select id into d from divisions where session_id = p_session_id and name = btrim(p_name);
  if d is null then
    lang := case when btrim(p_name) ~ '[א-ת]' or p_name ilike '%hebrew%' then 'he'
                 when p_name ilike '%french%' or p_name ilike '%fran%' then 'fr' else 'en' end;
    insert into divisions (session_id, name, language, sort_order)
      values (p_session_id, btrim(p_name), lang, (select coalesce(max(sort_order),0)+1 from divisions where session_id = p_session_id))
      returning id into d;
  end if;
  return d;
end $$;

create or replace function ensure_bunk(p_division_id uuid, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare b uuid;
begin
  if p_division_id is null or p_name is null or btrim(p_name) = '' then return null; end if;
  select id into b from bunks where division_id = p_division_id and name = btrim(p_name);
  if b is null then
    insert into bunks (division_id, name, sort_order)
      values (p_division_id, btrim(p_name), (select coalesce(max(sort_order),0)+1 from bunks where division_id = p_division_id))
      returning id into b;
  end if;
  return b;
end $$;

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

    -- rebuild import-sourced contacts. With emptyMeansUnknown (default) an empty
    -- cell never removes a contact: upsert only. Otherwise the file is authoritative.
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

  -- unchanged rows are still "in latest import"
  update campers set in_latest_import = true
    where id in (select matched_camper_id from import_rows where import_id = p_import_id and action = 'unchanged' and matched_camper_id is not null)
      and in_latest_import = false;

  -- campers in the file's divisions that were not in the file
  divs := coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(imp.options->'divisionsInFile','[]'::jsonb)) x), '{}');
  update campers c set in_latest_import = false
    from divisions d
    where c.division_id = d.id and d.session_id = imp.session_id and d.name = any(divs)
      and c.archived_at is null
      and c.id not in (select matched_camper_id from import_rows where import_id = p_import_id and matched_camper_id is not null);
  get diagnostics n_missing = row_count;

  update imports set status = 'applied', applied_at = now(), applied_by = auth.uid(),
    summary = coalesce(summary,'{}'::jsonb) || jsonb_build_object('appliedAdded', n_added, 'appliedUpdated', n_updated, 'markedMissing', n_missing)
    where id = p_import_id;
  return jsonb_build_object('added', n_added, 'updated', n_updated, 'missing', n_missing);
end $$;

-- ---------------------------------------------------------------------------
-- Defaults: mapping preset for the registration export, list presets
-- ---------------------------------------------------------------------------
insert into import_mappings (id, name, is_default, column_map, options) values (
  'a0000000-0000-0000-0000-000000000001', 'Registration export (Main Program Report)', true,
  '{
    "students.id": "source_id",
    "students.first_name": "first_name",
    "students.last_name": "last_name",
    "group_types.division": "division",
    "group_types.hebrew_bunks": "bunk",
    "group_types.french_bunks": "bunk",
    "group_types.bunks": "bunk",
    "ppa.grade": "grade",
    "ppa.t-shirt_size": "tshirt_size",
    "ppa.bunk_preference_1": "bunk_preferences[0]",
    "ppa.bunk_preference_2": "bunk_preferences[1]",
    "ppa.bunk_preference_3": "bunk_preferences[2]",
    "ppa.crown_heights_address": "local_address",
    "ppa.crown_heights_address_cross_streets": "local_address_cross_streets",
    "ppa.medical_considerations": "medical_notes",
    "ppa.allergies": "allergies",
    "ppa.allergies_yes_or_no": "has_allergies",
    "ppa.epipen_yes_no": "has_epipen",
    "ppa.medications_yes_no": "has_medications",
    "ppa.anything_else_we_should_know": "notes_from_parents",
    "mother.first_name": "contact[mother].name",
    "mother.phone": "contact[mother].phone",
    "father.first_name": "contact[father].first_name",
    "father.last_name": "contact[father].last_name",
    "father.phone": "contact[father].phone",
    "father.email": "contact[father].email",
    "ppa.emergency_contact_1": "contact[emergency,1].name",
    "ppa.phone_number_for_emergency_contact_1": "contact[emergency,1].phone",
    "ppa.emergency_contact_2": "contact[emergency,2].name",
    "ppa.emergency_contact_number": "contact[emergency,2].phone"
  }',
  '{
    "bunkColumnPriority": ["group_types.hebrew_bunks", "group_types.french_bunks", "group_types.bunks"],
    "booleanYes": ["yes", "y", "true", "oui", "כן"],
    "booleanNo": ["no", "n", "false", "non", "לא", ""],
    "phoneDefaultRegion": "US",
    "emptyMeansUnknown": true
  }'
) on conflict (id) do nothing;

insert into list_presets (id, name, audience, columns, sort, group_by, is_default) values
  ('b0000000-0000-0000-0000-000000000001', 'Counselor bunk list', 'counselor',
   '["display_name","grade","tshirt_size","has_medical_flag","contact.mother.phone","contact.father.phone"]',
   '[{"field":"last_name","dir":"asc"}]', 'bunk', true),
  ('b0000000-0000-0000-0000-000000000002', 'Head counselor division list', 'head_counselor',
   '["display_name","bunk","grade","tshirt_size","has_allergies","allergies","has_epipen","has_medications","contact.mother.phone","contact.father.phone","contact.emergency1.name","contact.emergency1.phone"]',
   '[{"field":"bunk","dir":"asc"},{"field":"last_name","dir":"asc"}]', 'bunk', true),
  ('b0000000-0000-0000-0000-000000000003', 'Division head list', 'division_head',
   '["display_name","camper_code","bunk","grade","tshirt_size","local_address","local_address_cross_streets","medical_notes","allergies","has_epipen","has_medications","notes_from_parents","contact.mother.name","contact.mother.phone","contact.father.name","contact.father.phone","contact.father.email","contact.emergency1.name","contact.emergency1.phone","contact.emergency2.name","contact.emergency2.phone"]',
   '[{"field":"bunk","dir":"asc"},{"field":"last_name","dir":"asc"}]', 'bunk', true),
  ('b0000000-0000-0000-0000-000000000004', 'Office roster', 'office',
   '["display_name","camper_code","division","bunk","status","in_latest_import"]',
   '[{"field":"division","dir":"asc"},{"field":"last_name","dir":"asc"}]', 'division', true),
  ('b0000000-0000-0000-0000-000000000005', 'Bus list', 'custom',
   '["display_name","bunk","status"]',
   '[{"field":"bunk","dir":"asc"},{"field":"last_name","dir":"asc"}]', 'bunk', false)
on conflict (id) do nothing;
