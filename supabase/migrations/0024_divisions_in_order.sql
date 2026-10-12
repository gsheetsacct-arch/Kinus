-- =============================================================================
-- Kinus — 0024: puts the divisions already there in order, once: numbered ones first in
-- number order (Division 1, 2, 3 … 10), then the rest A–Z (BMD), as the app orders new
-- ones (lib/bunk-order.ts compareDivisionNames). Uses bunk_sort_parts from 0023 for
-- divisions numbered with Hebrew letters.
-- =============================================================================
with ranked as (
  select d.id,
         row_number() over (
           partition by d.session_id
           order by coalesce(substring(d.name from '[0-9]+')::int, (bunk_sort_parts(d.name)).val) nulls last, lower(d.name)
         ) as n
  from divisions d
)
update divisions d set sort_order = r.n from ranked r where r.id = d.id and d.sort_order is distinct from r.n;
