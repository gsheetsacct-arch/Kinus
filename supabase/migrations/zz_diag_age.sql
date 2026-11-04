\pset pager off
select h, (select count(*) filter (where coalesce(c.source_data->>h,'') <> '') from campers c where c.session_id = (select id from sessions where is_active) and c.archived_at is null) as filled,
  (select min(c.source_data->>h) from campers c where c.session_id = (select id from sessions where is_active) and coalesce(c.source_data->>h,'') <> '') as sample
from imports i, jsonb_array_elements_text(i.options->'headers') h where i.file_name like '%export (22).csv' order by h;
