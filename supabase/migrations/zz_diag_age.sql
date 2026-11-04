\pset pager off
select k, count(*) as campers, count(*) filter (where coalesce(c.source_data->>k,'') <> '') as filled, min(c.source_data->>k) as sample
from campers c, jsonb_object_keys(c.source_data) k
where c.session_id = (select id from sessions where is_active) and c.archived_at is null and (k ilike '%age%' or k ilike '%birth%' or k ilike '%dob%' or k ilike '%גיל%')
group by k order by k;
select value from settings where key = 'hidden_columns';
select id, file_name, (select string_agg(k || '→' || v, ', ') from jsonb_each_text(options->'columnMap') as x(k, v) where k ilike '%age%' or k ilike '%birth%') as mapped from imports where status = 'applied' order by uploaded_at desc limit 3;
