\pset pager off
with now as (select it from print_jobs j, jsonb_array_elements(j.staff_items) it where j.id = '8fad8fcb-7b97-4b3a-9344-2abbf884e6a2'),
was as (select distinct on (it->>'name') it from print_jobs j, jsonb_array_elements(j.staff_items) it
        where j.template_id = '3ecd4678-12a4-48fe-aae3-5ceed7fbf7ae' and j.status <> 'cancelled' and j.id <> '8fad8fcb-7b97-4b3a-9344-2abbf884e6a2' and it->>'name' <> ''
        order by it->>'name', j.requested_at desc)
select n.it->>'name' as name,
  case when w.it is null then 'NEW' else concat_ws('; ',
    nullif(case when coalesce(w.it->'values'->>'__division','') <> coalesce(n.it->'values'->>'__division','') then 'design ' || coalesce(w.it->'values'->>'__division','—') || ' → ' || coalesce(n.it->'values'->>'__division','—') end, ''),
    case when coalesce(nullif(w.it->'values'->>'ROLE_HE',''), w.it->'values'->>'ROLE','') <> coalesce(nullif(n.it->'values'->>'ROLE_HE',''), n.it->'values'->>'ROLE','') then 'role ' || coalesce(nullif(w.it->'values'->>'ROLE_HE',''), w.it->'values'->>'ROLE','—') || ' → ' || coalesce(nullif(n.it->'values'->>'ROLE_HE',''), n.it->'values'->>'ROLE','—') end,
    case when coalesce(nullif(w.it->'values'->>'BUNK_HE',''), w.it->'values'->>'BUNK','') <> coalesce(nullif(n.it->'values'->>'BUNK_HE',''), n.it->'values'->>'BUNK','') then 'bunk ' || coalesce(nullif(w.it->'values'->>'BUNK_HE',''), nullif(w.it->'values'->>'BUNK',''),'—') || ' → ' || coalesce(nullif(n.it->'values'->>'BUNK_HE',''), nullif(n.it->'values'->>'BUNK',''),'—') end,
    case when coalesce(w.it->'values'->>'FIRST','') || ' ' || coalesce(w.it->'values'->>'LAST','') <> coalesce(n.it->'values'->>'FIRST','') || ' ' || coalesce(n.it->'values'->>'LAST','') then 'name' end
  ) end as what
from now n left join was w on w.it->>'name' = n.it->>'name' order by 2, 1;
