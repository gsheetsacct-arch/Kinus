-- read-only diagnostic (not a migration): the Thursday bunks upload
select 'latest imports' as what, status, file_name, uploaded_at, options->>'thursdayOnly' as thursday_only,
       summary->>'updated' as updated, summary->>'added' as added, summary->>'skipped' as skipped, summary->>'markedMissing' as marked_missing
  from imports order by uploaded_at desc limit 3;
with imp as (select id from imports order by uploaded_at desc limit 1)
select 'rows' as what, action, count(*), count(*) filter (where row_number >= 1000000) as thursday_rownums
  from import_rows where import_id = (select id from imp) group by action;
with imp as (select id from imports order by uploaded_at desc limit 1)
select 'changed fields' as what, ch->>'field' as field, count(*)
  from import_rows r, jsonb_array_elements(r.changes) ch where r.import_id = (select id from imp) group by 2 order by 2;
with imp as (select id from imports order by uploaded_at desc limit 1)
select 'matched records' as what, case when c.source_id like 'thursday:%' then 'thursday record' else 'REGULAR record' end as kind, d.name, count(*)
  from import_rows r join campers c on c.id = r.matched_camper_id left join divisions d on d.id = c.division_id
 where r.import_id = (select id from imp) group by 2, 3;
select 'thursday bunks' as what, d.name, count(distinct b.id) as bunks, count(c.id) as campers, count(c.id) filter (where c.bunk_id is null) as no_bunk
  from divisions d left join bunks b on b.division_id = d.id left join campers c on c.division_id = d.id and c.archived_at is null
 where d.name ilike 'thursday%' and d.session_id = (select id from sessions where is_active) group by d.name;
select 'regular americans' as what, count(*) as campers, count(*) filter (where c.bunk_id is null) as no_bunk, count(*) filter (where not c.in_latest_import) as missing,
       count(*) filter (where not exists (select 1 from camper_contacts cc where cc.camper_id = c.id)) as no_contacts
  from campers c join divisions d on d.id = c.division_id
 where c.session_id = (select id from sessions where is_active) and c.archived_at is null and d.name in ('Division 1','Division 2','Division 3','Bar Mitzvah Program');
