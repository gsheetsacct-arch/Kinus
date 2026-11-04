\pset pager off
select j.id, j.requested_at, j.status, it->>'name' as name, it->'values'->>'DIVISION' as division, it->'values'->>'BUNK_CONTINUED' as num, it->'values'->>'PHONE' as phone, it->>'id' as pid
from print_jobs j, jsonb_array_elements(j.staff_items) it
where j.template_id = 'b82e75c7-18ab-4c74-b5ff-a4aa1bd211c3' and j.status <> 'cancelled' and it->>'name' in ('Ari Boaz','Akiva Small','Berel Emlen','Arik Schectman','Ari Freeman')
order by it->>'name', j.requested_at;
