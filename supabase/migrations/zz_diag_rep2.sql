\pset pager off
with items as (
  select j.id as job, j.requested_at, j.status, t.name as tag, c.id as cid, c.camper_code, c.first_name || ' ' || c.last_name as name, left(coalesce(j.note,''), 50) as note
  from print_jobs j join print_templates t on t.id = j.template_id join print_job_items i on i.job_id = j.id join campers c on c.id = i.camper_id
  where t.id in ('c799f212-59b3-4e6e-9273-d969e65ad51c','3ba04bd4-2c24-44a0-860b-f28129a6d1bc','c74370db-3dc7-4c8f-9d82-9fd7b9dcd14f')
    and j.status <> 'cancelled' and c.source_id not like 'thursday:%'
), ranked as (select *, row_number() over (partition by cid order by requested_at) as nth, count(*) over (partition by cid) as times from items)
select to_char(r.requested_at at time zone 'America/New_York', 'Mon DD HH24:MI') as asked, r.status, r.tag, r.camper_code, r.name,
  case when r.nth = 1 then 'NEW (first badge)' else 'REPLACES badge from ' || (select to_char(p.requested_at at time zone 'America/New_York', 'Mon DD HH24:MI') from ranked p where p.cid = r.cid and p.nth = r.nth - 1) end as what, r.note
from ranked r where r.times > 1 or r.requested_at > (select min(requested_at) + interval '6 hours' from items)
  and r.nth > 0 and (r.nth > 1 or r.requested_at > (select min(requested_at) from items) + interval '6 hours')
order by r.requested_at, r.tag, r.name;
