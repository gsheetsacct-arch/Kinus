-- read-only: Yisroel Shemtov on staff luggage tag requests
select j.requested_at, j.status, e->>'division' as division, e->'values' as vals, e->>'id' as id
from print_jobs j, jsonb_array_elements(coalesce(j.staff_items, '[]'::jsonb)) e
where j.template_id = 'b82e75c7-18ab-4c74-b5ff-a4aa1bd211c3' and e->>'name' ilike 'yisroel shemtov%'
order by j.requested_at;
