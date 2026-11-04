-- read-only diagnostic (not a migration): after undoing the Thursday English file
select 'import' as what, status from imports where id = '00c25d38-26ed-4599-a813-3e8c56014062';
with hit as (select matched_camper_id as id from import_rows where import_id = '00c25d38-26ed-4599-a813-3e8c56014062' and matched_camper_id is not null)
select 'the 216 now' as what, count(*) as campers,
       count(*) filter (where c.bunk_id is null) as no_bunk,
       count(*) filter (where c.local_address is null or c.local_address = '') as no_address,
       count(*) filter (where c.tshirt_size is null or c.tshirt_size = '') as no_tshirt,
       count(*) filter (where c.has_allergies is null) as allergies_unknown,
       count(*) filter (where not c.in_latest_import) as marked_missing,
       (select count(*) from camper_contacts cc where cc.camper_id in (select id from hit)) as contacts,
       count(*) filter (where not exists (select 1 from camper_contacts cc where cc.camper_id = c.id)) as with_no_contacts,
       count(*) filter (where (select count(*) from jsonb_object_keys(case when jsonb_typeof(c.source_data) = 'object' then c.source_data else '{}' end)) < 10) as few_export_columns
  from campers c where c.id in (select id from hit);
-- the same counts for everyone else in those divisions, to compare (how many normally have no bunk etc.)
with hit as (select matched_camper_id as id from import_rows where import_id = '00c25d38-26ed-4599-a813-3e8c56014062' and matched_camper_id is not null)
select 'other americans' as what, count(*) as campers,
       count(*) filter (where c.bunk_id is null) as no_bunk,
       count(*) filter (where c.local_address is null or c.local_address = '') as no_address,
       count(*) filter (where c.tshirt_size is null or c.tshirt_size = '') as no_tshirt,
       count(*) filter (where not exists (select 1 from camper_contacts cc where cc.camper_id = c.id)) as with_no_contacts
  from campers c join divisions d on d.id = c.division_id
 where c.session_id = (select id from sessions where is_active) and c.archived_at is null and d.name in ('Division 1','Division 2','Division 3','Bar Mitzvah Program') and c.id not in (select id from hit);
select 'american missing now' as what, d.name, count(*) filter (where not c.in_latest_import) as marked_missing, count(*) as campers
  from campers c join divisions d on d.id = c.division_id
 where c.session_id = (select id from sessions where is_active) and c.archived_at is null and d.name in ('Division 1','Division 2','Division 3','Bar Mitzvah Program')
 group by d.name;
select 'the undo' as what, source, table_name, action, count(*) from audit_log where source in ('revert:00c25d38-26ed-4599-a813-3e8c56014062', 'import:00c25d38-26ed-4599-a813-3e8c56014062') group by 2, 3, 4 order by 2, 3, 4;
-- the 2 moved to Division 1: where are they now
select 'moved two' as what, d.name as division_now, r.changes->0->>'old' as old_value
  from import_rows r join campers c on c.id = r.matched_camper_id left join divisions d on d.id = c.division_id, jsonb_array_elements(r.changes) ch
 where r.import_id = '00c25d38-26ed-4599-a813-3e8c56014062' and ch->>'field' = 'division';
select 'drafts' as what, status, count(*) from imports where session_id = (select id from sessions where is_active) group by status;
