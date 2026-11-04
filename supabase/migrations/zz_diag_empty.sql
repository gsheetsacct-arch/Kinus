\pset pager off
select id, file_name, status, uploaded_at, options->>'emptyMeansUnknown' as empty_keeps, options->>'correctedCopy' as corrected, options->>'thursdayOnly' as thu, summary->>'updated' as updated from imports order by uploaded_at desc limit 3;
with imp as (select id from imports order by uploaded_at desc limit 1),
ch as (select r.row_number, c->>'field' as field, c->>'old' as old, c->>'new' as new from import_rows r, imp, jsonb_array_elements(r.changes) c where r.import_id = imp.id and r.action = 'update')
select field, count(*) filter (where new is null) as to_empty, count(*) filter (where new is not null) as to_value, count(*) as total from ch group by field order by to_empty desc, total desc limit 40;
with imp as (select id from imports order by uploaded_at desc limit 1)
select r.row_number, c->>'field' as field, left(c->>'old', 40) as old, left(c->>'new', 40) as new from import_rows r, imp, jsonb_array_elements(r.changes) c where r.import_id = imp.id and r.action = 'update' and c->>'new' is null limit 15;
