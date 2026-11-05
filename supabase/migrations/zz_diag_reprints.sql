-- read-only: per camper, packing labels and luggage tags: first printing vs latest, and who is new since the first run
with fam as (
  select id, case when name like 'Packing Labels%' then 'packing' else 'luggage' end as family
  from print_templates where name like 'Packing Labels%' or name like 'Luggage Tag (Colored Labels)%'
),
jobs as (
  select j.id, f.family, j.requested_at from print_jobs j join fam f on f.id = j.template_id
  where j.status not in ('cancelled', 'failed')
),
first_run as (select family, min(requested_at) as at from jobs group by family),
items as (select j.family, i.camper_id, i.content_hash, j.requested_at from print_job_items i join jobs j on j.id = i.job_id),
per as (
  select family, camper_id, count(*) as printings, min(requested_at) as first_at,
    (array_agg(content_hash order by requested_at))[1] as first_hash,
    (array_agg(content_hash order by requested_at desc))[1] as last_hash
  from items group by family, camper_id
)
select p.family, c.camper_code as code, c.first_name || ' ' || c.last_name as camper, d.name as division, coalesce(b.name, '') as bunk,
  case when p.first_at > f.at + interval '2 hours' then 'new' else 'changed' end as why, p.printings
from per p join first_run f on f.family = p.family join campers c on c.id = p.camper_id
left join divisions d on d.id = c.division_id left join bunks b on b.id = c.bunk_id
where c.archived_at is null and (p.first_at > f.at + interval '2 hours' or p.first_hash is distinct from p.last_hash)
order by p.family, d.sort_order, d.name, b.sort_order, c.last_name;
