\pset pager off
with r as (select row_number, matched_camper_id, parsed from import_rows where import_id = 'f22ce13e-e934-4c23-8224-6b48acecf26a' and row_number in (1000388, 1000402))
select r.row_number,
  (select string_agg(k || '=' || coalesce(r.parsed->'source_data'->>k, 'NULL'), ' | ') from jsonb_object_keys(r.parsed->'source_data') k where k ilike '%thursday%') as parsed_thu,
  (select string_agg(k || '=' || coalesce(c.source_data->>k, 'NULL'), ' | ') from jsonb_object_keys(c.source_data) k where k ilike '%thursday%') as camper_thu,
  c.source_fixes as fixes, c.source_id
from r join campers c on c.id = r.matched_camper_id;
select count(*) as rows_with_thu_change from import_rows r, jsonb_array_elements(r.changes) c where r.import_id = 'f22ce13e-e934-4c23-8224-6b48acecf26a' and c->>'field' = 'source.group_types.thursday_bunks';
