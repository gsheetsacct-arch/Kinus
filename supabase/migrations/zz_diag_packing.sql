-- read-only: packing labels, every printing per camper: who is new or changed since the first packing run
with t as (select id from print_templates where name like 'Packing Labels%'),
jobs as (
  select j.id, j.template_id, j.requested_at, j.status from print_jobs j
  where j.template_id in (select id from t) and j.status not in ('cancelled', 'failed')
),
first_run as (select min(requested_at) as at from jobs),
items as (
  select i.camper_id, i.content_hash, j.requested_at, j.status, j.id as job_id
  from print_job_items i join jobs j on j.id = i.job_id
),
per as (
  select camper_id,
    count(*) as printings,
    min(requested_at) as first_at,
    max(requested_at) as last_at,
    (array_agg(content_hash order by requested_at))[1] as first_hash,
    (array_agg(content_hash order by requested_at desc))[1] as last_hash,
    string_agg(to_char(requested_at at time zone 'America/New_York', 'Mon DD HH24:MI') || ' ' || status, ', ' order by requested_at) as history
  from items group by camper_id
)
select 'jobs' as what, to_char(j.requested_at at time zone 'America/New_York', 'Mon DD HH24:MI') as at, j.status::text, (select count(*) from print_job_items where job_id = j.id)::text as n, (select name from print_templates where id = j.template_id) as tag
from jobs j order by j.requested_at;

with t as (select id from print_templates where name like 'Packing Labels%'),
jobs as (select j.id, j.requested_at, j.status from print_jobs j where j.template_id in (select id from t) and j.status not in ('cancelled', 'failed')),
first_run as (select min(requested_at) as at from jobs),
items as (select i.camper_id, i.content_hash, j.requested_at, j.status from print_job_items i join jobs j on j.id = i.job_id),
per as (
  select camper_id, count(*) as printings, min(requested_at) as first_at,
    (array_agg(content_hash order by requested_at))[1] as first_hash,
    (array_agg(content_hash order by requested_at desc))[1] as last_hash,
    string_agg(to_char(requested_at at time zone 'America/New_York', 'Mon DD HH24:MI') || ' ' || status, ', ' order by requested_at) as history
  from items group by camper_id
)
select c.first_name || ' ' || c.last_name as camper, d.name as division, b.name as bunk,
  case when p.first_at > (select at from first_run) + interval '2 hours' then 'new since first run'
       when p.first_hash is distinct from p.last_hash then 'changed since first run'
       else 'reprinted, same' end as why,
  p.printings, p.history
from per p join campers c on c.id = p.camper_id left join divisions d on d.id = c.division_id left join bunks b on b.id = c.bunk_id
where p.printings > 1 or p.first_at > (select at from first_run) + interval '2 hours'
order by d.sort_order, d.name, b.sort_order, c.last_name;
