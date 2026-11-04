-- read-only diagnostic (not a migration): the latest imports and the Thursday Program's bunks
select id, status, file_name, uploaded_at, jsonb_array_length(coalesce(options->'thursdayDivisions','[]')) as thursday_divs,
       (select count(*) from jsonb_array_elements_text(coalesce(options->'headers','[]')) h where h ilike '%thursday%') as thursday_headers,
       options->>'takeBunksFromFile' as take_bunks
  from imports order by uploaded_at desc limit 4;

with imp as (select id from imports where status in ('applied','previewed') order by uploaded_at desc limit 1)
select 'rows' as what, action, count(*) as n,
       count(*) filter (where row_number >= 1000000) as thursday_rows,
       count(*) filter (where row_number >= 1000000 and coalesce(parsed->>'bunk_name','') <> '') as thursday_with_bunk
  from import_rows where import_id = (select id from imp) group by action;

with imp as (select id from imports where status in ('applied','previewed') order by uploaded_at desc limit 1)
select 'raw thursday_bunks' as what, k as header, count(*) filter (where coalesce(raw->>k,'') <> '') as filled,
       string_agg(distinct nullif(raw->>k,''), ', ') as sample
  from import_rows, jsonb_object_keys(raw) k
 where import_id = (select id from imp) and row_number < 1000000 and k ilike '%thursday%'
 group by k;

with imp as (select id from imports where status in ('applied','previewed') order by uploaded_at desc limit 1)
select 'thursday parsed bunks' as what, parsed->>'division_name' as division, string_agg(distinct coalesce(parsed->>'bunk_name','(none)'), ', ') as bunks, count(*)
  from import_rows where import_id = (select id from imp) and row_number >= 1000000 group by 1, 2;

select 'kinus bunks' as what, d.name as division, g.name as camp, count(b.id) as bunks, string_agg(b.name, ', ' order by b.sort_order) as names
  from divisions d left join division_groups g on g.id = d.group_id left join bunks b on b.division_id = d.id
 where d.name ilike 'thursday%' and d.session_id = (select id from sessions where is_active)
 group by d.name, g.name;

select 'mapping' as what, k as column_name, cm->>k as target
  from (select column_map as cm from import_mappings) m, jsonb_object_keys(cm) k where k ilike '%thursday%' or cm->>k = 'bunk';
