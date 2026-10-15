-- =============================================================================
-- Kinus — 0033: city, state and country from the family record
--   The export has the address twice: the registration form's answers (ppa.city,
--   ppa.state, ppa.country) and the family record (family.city, family.state,
--   family.country). Both were shown, under the same names ("City" twice). Only the
--   family record is used now: label fields and list layouts that read the form's
--   columns read the family record's, the extra fields shown on camper pages and in
--   lists are the family record's (keeping their names), and the form's three columns
--   are left out of the column choices (settings.hidden_columns).
--   Only where an import has brought the family record's columns.
-- =============================================================================
do $$
begin
  if not exists (
    select 1 from imports i, jsonb_array_elements_text(case when jsonb_typeof(i.options->'headers') = 'array' then i.options->'headers' else '[]'::jsonb end) h(value)
     where lower(h.value) in ('family.city', 'family.state', 'family.country')
  ) then
    return;
  end if;

  update merge_fields
     set source_field = regexp_replace(source_field, 'source\.ppa\.(city|state|country)(?![\w.])', 'source.family.\1', 'gi')
   where source_field ~* 'source\.ppa\.(city|state|country)(?![\w.])';

  update list_presets
     set columns = regexp_replace(columns::text, '"source\.ppa\.(city|state|country)"', '"source.family.\1"', 'gi')::jsonb,
         sort = regexp_replace(sort::text, '"source\.ppa\.(city|state|country)"', '"source.family.\1"', 'gi')::jsonb,
         filters = regexp_replace(filters::text, '"source\.ppa\.(city|state|country)"', '"source.family.\1"', 'gi')::jsonb
   where (columns::text || sort::text || filters::text) ~* '"source\.ppa\.(city|state|country)"';

  -- the form's city/state/country extra fields become the family record's; one of each, the first name kept
  update settings s
     set value = (
       select coalesce(jsonb_agg(t.v order by t.ord), '[]'::jsonb)
         from (
           select m.v, m.ord, row_number() over (partition by lower(m.v->>'column') order by m.ord) as n
             from (
               select case when lower(f.value->>'column') in ('ppa.city', 'ppa.state', 'ppa.country')
                           then jsonb_set(f.value, '{column}', to_jsonb('family.' || split_part(lower(f.value->>'column'), '.', 2)))
                           else f.value end as v,
                      f.ord
                 from jsonb_array_elements(s.value) with ordinality f(value, ord)
             ) m
         ) t
        where t.n = 1
     )
   where s.key = 'extra_fields' and jsonb_typeof(s.value) = 'array';

  insert into settings (key, value) values ('hidden_columns', '["ppa.city", "ppa.state", "ppa.country"]'::jsonb)
  on conflict (key) do update
    set value = (select coalesce(jsonb_agg(distinct x.value), '[]'::jsonb) from jsonb_array_elements(settings.value || excluded.value) x(value));
end $$;
