-- =============================================================================
-- Kinus — 0011: the 4×6 labels show the camper number up the left side (as in the
-- Publisher original's «camper_id»), not a barcode.
-- =============================================================================
update print_templates t
set layers = (
  select jsonb_agg(
           case when e->>'id' = 'code'
             then '{"id":"code","type":"text","text":"{{CODE}}","x":2.5,"y":5,"w":6,"h":30,"size":10,"align":"right","color":"#777777","fit":true,"rotate":-90}'::jsonb
             else e end
           order by n)
  from jsonb_array_elements(t.layers) with ordinality as x(e, n)
),
updated_at = now()
where t.id in ('d0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000004');
