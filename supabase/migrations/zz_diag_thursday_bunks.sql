-- read-only diagnostic (not a migration): what the Thursday English file changed
with imp as (select '00c25d38-26ed-4599-a813-3e8c56014062'::uuid as id)
select 'headers' as what, string_agg(h, ' | ') from imports, jsonb_array_elements_text(options->'headers') h where id = (select id from imp);
with imp as (select '00c25d38-26ed-4599-a813-3e8c56014062'::uuid as id)
select 'changes' as what, c->>'field' as field, count(*) as campers, string_agg(distinct coalesce(c->>'new','(empty)'), ', ') filter (where c->>'field' not like 'source%') as new_values
  from import_rows r, jsonb_array_elements(r.changes) c where r.import_id = (select id from imp) group by c->>'field' order by 2;
with imp as (select '00c25d38-26ed-4599-a813-3e8c56014062'::uuid as id)
select 'summary' as what, summary - 'missingList' - 'exportChanged' - 'columns' as summary, options->'columnMap' as column_map, options->'divisionsInFile' as divs from imports where id = (select id from imp);
with imp as (select '00c25d38-26ed-4599-a813-3e8c56014062'::uuid as id)
select 'matched to' as what, d.name as division, count(*) from import_rows r join campers c on c.id = r.matched_camper_id left join divisions d on d.id = c.division_id where r.import_id = (select id from imp) group by d.name;
select 'audit' as what, table_name, action, count(*) from audit_log where source = 'import:00c25d38-26ed-4599-a813-3e8c56014062' group by 2, 3;
