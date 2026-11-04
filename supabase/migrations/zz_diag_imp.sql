\pset pager off
select id, file_name, status, uploaded_at, options->'columnMap'->>'students.group' as group_target, options->>'emptyMeansUnknown' as keep_empty, options->>'takeBunksFromFile' as bunks_from_file from imports order by uploaded_at desc limit 1;
with imp as (select id from imports order by uploaded_at desc limit 1)
select r.action, r.row_number, r.parsed->>'first_name' || ' ' || (r.parsed->>'last_name') as name, r.parsed->>'source_id' as id, r.parsed->>'division_name' as division, r.parsed->>'bunk_name' as bunk, left(r.parsed->'source_data'->>'students.group', 90) as grp, r.changes
from import_rows r, imp where r.import_id = imp.id and r.action in ('add','update') order by r.action, r.row_number;
select summary->'missing' as missing from imports order by uploaded_at desc limit 1;
with imp as (select id from imports order by uploaded_at desc limit 1)
select count(*) filter (where row_number >= 1000000) as thursday_rows, count(*) filter (where row_number >= 1000000 and parsed->>'division_name' ilike '%english%') as thu_en, count(*) filter (where row_number >= 1000000 and parsed->>'division_name' ilike '%french%') as thu_fr, count(*) filter (where row_number >= 1000000 and parsed->>'division_name' ilike '%hebrew%') as thu_he from import_rows r, imp where r.import_id = imp.id;
select count(*) filter (where source_id like 'thursday:%' and archived_at is null and in_latest_import) as thursday_now from campers where session_id = (select id from sessions where is_active);
