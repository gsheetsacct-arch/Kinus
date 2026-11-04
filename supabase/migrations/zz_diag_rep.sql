\pset pager off
-- the new requests: queued after 20:15 UTC today, not printed or cancelled
create temp table newjobs as select j.id, j.template_id, t.name as tag, j.requested_at, j.note from print_jobs j join print_templates t on t.id = j.template_id where j.requested_at > '2026-11-04 20:15+00' and j.status not in ('cancelled','printed');
-- campers
select n.tag, c.first_name || ' ' || c.last_name as who,
  coalesce((select 'replaces ' || to_char(o.requested_at at time zone 'America/New_York', 'Mon DD HH24:MI') || ' (' || left(coalesce(o.note,''), 40) || ')' from print_jobs o join print_job_items oi on oi.job_id = o.id
    where oi.camper_id = i.camper_id and o.template_id = n.template_id and o.id <> n.id and o.status <> 'cancelled' and o.requested_at < n.requested_at order by o.requested_at desc limit 1), 'NEW (on top)') as what
from newjobs n join print_job_items i on i.job_id = n.id join campers c on c.id = i.camper_id order by n.tag, what, who;
-- staff: counts per new job, replaced vs new
select n.tag, left(n.note, 60) as request, count(*) as tags,
  count(*) filter (where exists (select 1 from print_jobs o, jsonb_array_elements(o.staff_items) oit where o.template_id = n.template_id and o.id <> n.id and o.status <> 'cancelled' and o.requested_at < n.requested_at and (oit->>'name') = (it->>'name'))) as replaces_earlier,
  string_agg(case when not exists (select 1 from print_jobs o, jsonb_array_elements(o.staff_items) oit where o.template_id = n.template_id and o.id <> n.id and o.status <> 'cancelled' and o.requested_at < n.requested_at and (oit->>'name') = (it->>'name')) then it->>'name' end, ', ') as new_on_top
from newjobs n, print_jobs j, jsonb_array_elements(j.staff_items) it where j.id = n.id and it->>'name' <> '' group by 1,2 order by 1,2;
-- the earlier staff luggage requests these replace
select to_char(requested_at at time zone 'America/New_York', 'Mon DD HH24:MI') as asked, status, item_count, left(note, 70) as note from print_jobs where template_id = 'b82e75c7-18ab-4c74-b5ff-a4aa1bd211c3' and status <> 'cancelled' and requested_at < '2026-11-04 20:15+00' order by requested_at;
