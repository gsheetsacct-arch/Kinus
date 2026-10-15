-- =============================================================================
-- Kinus — 0032: one column per name, whatever the spelling
--   The same export column can come with different capitals, spaces, or "#" for "."
--   ("family.city", "Family.City", "family#city"). The import now makes one column of
--   them; this does the same for what's stored: each camper's export columns keep one
--   key per column (the first spelling in alphabetical order) holding a filled-in value
--   if any copy has one; past imports' column lists and the extra fields keep one of each.
-- =============================================================================

create or replace function pg_temp.col_key(k text) returns text language sql immutable as $$
  select lower(regexp_replace(replace(btrim(k), '#', '.'), '\s+', ' ', 'g'))
$$;

with keys as (
  select c.id, e.key, e.value, pg_temp.col_key(e.key) as nk
    from campers c, jsonb_each(c.source_data) e
   where jsonb_typeof(c.source_data) = 'object'
), doubled as (
  select distinct id from keys group by id, nk having count(*) > 1
), merged as (
  select k.id,
         jsonb_object_agg(k.first_key, k.best) as data
    from (
      select id, nk,
             min(key) as first_key,
             -- a copy with something in it wins over an empty one
             (array_agg(value order by (value = '""'::jsonb or value = 'null'::jsonb), key))[1] as best
        from keys
       where id in (select id from doubled)
       group by id, nk
    ) k
   group by k.id
)
update campers c set source_data = m.data from merged m where c.id = m.id;

update imports i
   set options = jsonb_set(i.options, '{headers}', (
     select coalesce(jsonb_agg(h.value order by h.ord), '[]'::jsonb)
       from (
         select value, ord, row_number() over (partition by pg_temp.col_key(value) order by ord) as n
           from jsonb_array_elements_text(i.options->'headers') with ordinality t(value, ord)
       ) h
      where h.n = 1
   ))
 where jsonb_typeof(i.options->'headers') = 'array'
   and (select count(*) from jsonb_array_elements_text(i.options->'headers'))
     > (select count(distinct pg_temp.col_key(value)) from jsonb_array_elements_text(i.options->'headers') value);

update settings s
   set value = (
     select coalesce(jsonb_agg(f.value order by f.ord), '[]'::jsonb)
       from (
         select value, ord, row_number() over (partition by pg_temp.col_key(coalesce(value->>'column', ''))  order by ord) as n
           from jsonb_array_elements(s.value) with ordinality t(value, ord)
       ) f
      where f.n = 1
   )
 where s.key = 'extra_fields' and jsonb_typeof(s.value) = 'array';
