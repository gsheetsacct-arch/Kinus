-- read-only diagnostic (not a migration): did undoing the Thursday English file put everything back?
select 'import' as what, status, file_name from imports where id = '00c25d38-26ed-4599-a813-3e8c56014062';
select 'later imports' as what, status, file_name, uploaded_at from imports where uploaded_at > (select uploaded_at from imports where id = '00c25d38-26ed-4599-a813-3e8c56014062') order by uploaded_at;
with hit as (select matched_camper_id as id from import_rows where import_id = '00c25d38-26ed-4599-a813-3e8c56014062' and matched_camper_id is not null)
select 'the 216 now' as what,
       count(*) as campers,
       count(*) filter (where c.bunk_id is null) as no_bunk,
       count(*) filter (where c.local_address is null or c.local_address = '') as no_address,
       count(*) filter (where c.tshirt_size is null or c.tshirt_size = '') as no_tshirt,
       count(*) filter (where c.has_allergies is null) as allergies_unknown,
       count(*) filter (where not c.in_latest_import) as marked_missing,
       count(*) filter (where c.archived_at is not null) as archived,
       (select count(*) from camper_contacts cc where cc.camper_id in (select id from hit)) as contacts,
       count(*) filter (where not exists (select 1 from camper_contacts cc where cc.camper_id = c.id)) as with_no_contacts,
       count(*) filter (where c.source_data ? 'ppa.allergies' or c.source_data ? 'students.id' ) as has_export_columns,
       count(*) filter (where jsonb_typeof(c.source_data) = 'object' and (select count(*) from jsonb_object_keys(c.source_data)) < 10) as few_export_columns
  from campers c where c.id in (select id from hit);
select 'american missing now' as what, d.name, count(*) filter (where not c.in_latest_import) as marked_missing, count(*) as campers
  from campers c join divisions d on d.id = c.division_id
 where c.session_id = (select id from sessions where is_active) and c.archived_at is null and d.name in ('Division 1','Division 2','Division 3','Bar Mitzvah Program')
 group by d.name;
select 'audit of the undo' as what, source, table_name, action, count(*) from audit_log where source like '%00c25d38-26ed-4599-a813-3e8c56014062%' group by 2, 3, 4 order by 2, 3, 4;
select 'thursday bunks' as what, d.name, count(b.id) from divisions d left join bunks b on b.division_id = d.id where d.name ilike 'thursday%' and d.session_id = (select id from sessions where is_active) group by d.name;
