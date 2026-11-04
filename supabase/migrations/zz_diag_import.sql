select id, file_name, status, uploaded_at, mapping_id, options->'headers' as headers, options->'columnMap' as column_map, summary from imports order by uploaded_at desc limit 3;
select id, name, is_default, column_map->>'students.id' as sid, options->>'fixedDivision' as fixed, (select count(*) from jsonb_object_keys(column_map)) as n from import_mappings order by created_at;
