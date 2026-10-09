-- =============================================================================
-- Kinus — 0004: divisions get a colour automatically (import-created ones had none)
-- =============================================================================

create or replace function division_palette_color(p_index int) returns text
language sql immutable as $$
  select (array['#2563eb','#0891b2','#059669','#65a30d','#ca8a04','#ea580c','#dc2626','#db2777','#9333ea','#475569'])[1 + (greatest(p_index, 1) - 1) % 10]
$$;

create or replace function divisions_default_color() returns trigger language plpgsql as $$
begin
  if new.color is null then
    new.color := division_palette_color(coalesce(nullif(new.sort_order, 0), (select count(*) + 1 from divisions where session_id = new.session_id)::int));
  end if;
  return new;
end $$;

drop trigger if exists divisions_default_color on divisions;
create trigger divisions_default_color before insert on divisions for each row execute function divisions_default_color();

-- backfill: existing divisions without a colour, in their display order per session
update divisions d set color = division_palette_color(x.rn::int)
from (select id, row_number() over (partition by session_id order by sort_order, name) rn from divisions) x
where d.id = x.id and d.color is null;
