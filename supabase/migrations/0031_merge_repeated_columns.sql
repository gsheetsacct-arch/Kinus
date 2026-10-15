-- =============================================================================
-- Kinus — 0031: one column per name
--   For a short while, a column name the export repeats (family.city listed twice, or once
--   per family) was kept as extra copies: "family.city (2)". The import now makes one column
--   of them (the first copy filled in), and this takes the stored copies away: from campers'
--   export columns, from the column lists of past imports, and from the extra fields chosen.
--   Only a "<name> (n)" whose plain <name> is there too is a copy; anything else stays.
-- =============================================================================

update campers c
   set source_data = (
     select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
       from jsonb_each(c.source_data) e
      where not (e.key ~ ' \(\d+\)$' and c.source_data ? regexp_replace(e.key, ' \(\d+\)$', ''))
   )
 where c.source_data is not null
   and jsonb_typeof(c.source_data) = 'object'
   and exists (select 1 from jsonb_object_keys(c.source_data) k
                where k ~ ' \(\d+\)$' and c.source_data ? regexp_replace(k, ' \(\d+\)$', ''));

update imports i
   set options = jsonb_set(i.options, '{headers}', (
     select coalesce(jsonb_agg(h.value order by h.ord), '[]'::jsonb)
       from jsonb_array_elements_text(i.options->'headers') with ordinality h(value, ord)
      where not (h.value ~ ' \(\d+\)$' and (i.options->'headers') ? regexp_replace(h.value, ' \(\d+\)$', ''))
   ))
 where jsonb_typeof(i.options->'headers') = 'array'
   and exists (select 1 from jsonb_array_elements_text(i.options->'headers') h(value)
                where h.value ~ ' \(\d+\)$' and (i.options->'headers') ? regexp_replace(h.value, ' \(\d+\)$', ''));

update settings s
   set value = (
     select coalesce(jsonb_agg(f.value order by f.ord), '[]'::jsonb)
       from jsonb_array_elements(s.value) with ordinality f(value, ord)
      where not coalesce((f.value->>'column') ~ ' \(\d+\)$', false)
   )
 where s.key = 'extra_fields' and jsonb_typeof(s.value) = 'array';
