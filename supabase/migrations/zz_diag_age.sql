\pset pager off
select file_name, status, to_char(uploaded_at at time zone 'America/New_York','Mon DD HH24:MI') as at, jsonb_array_length(options->'headers') as n_headers,
  (select string_agg(h, ' | ') from jsonb_array_elements_text(options->'headers') h where h ilike '%age%' or h ilike '%birth%' or h ilike '%dob%' or h ilike '%year%' or h ilike '%גיל%') as agey
from imports order by uploaded_at desc limit 4;
