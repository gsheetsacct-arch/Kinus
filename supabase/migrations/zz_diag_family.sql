-- read-only: the latest export's columns that look like a family id, and a sample
\pset footer off
select h from imports i, jsonb_array_elements_text(i.options->'headers') h
where i.id = (select id from imports order by uploaded_at desc limit 1) and h ilike '%famil%' ;
select count(*) as campers, count(distinct c.source_data->>'family.id') as fam_id, count(distinct c.source_data->>'family_id') as fam_id2, count(distinct c.source_data->>'students.family_id') as fam_id3
from campers c join sessions s on s.id = c.session_id and s.is_active where c.archived_at is null;
select jsonb_object_keys(c.source_data) k from campers c join sessions s on s.id = c.session_id and s.is_active where c.archived_at is null limit 400;
