-- =============================================================================
-- Kinus — 0034: fixes to registration columns that imports never overwrite
--   * campers.source_fixes holds staff corrections to export columns (a Hebrew name
--     typed in English, or spelled out as "nun shin beis tes"), by column:
--       { "ppa.hebrew_name": { "value": "נשבט", "was": "nun shin beis tes", "by": <uuid>, "at": <time> } }
--     Everything that reads an export column (labels, lists, the camper card) reads the
--     fix instead. Imports refresh source_data and never touch source_fixes.
--   * next session's import carries a camper's fixes over (same registration id) while
--     the registration still says what was fixed; once the family corrects it there,
--     the registration's own value is used again.
-- =============================================================================

alter table campers add column if not exists source_fixes jsonb not null default '{}';
comment on column campers.source_fixes is 'Staff corrections to export columns (source_data), by column key; imports never overwrite them.';

-- "family#City " and "family.city" are one column
create or replace function column_key(k text) returns text
language sql immutable as $$
  select lower(regexp_replace(replace(btrim(k), '#', '.'), '\s+', ' ', 'g'))
$$;

create or replace function campers_carry_source_fixes() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  prev jsonb;
begin
  if new.source_id is null or new.source_fixes <> '{}'::jsonb then return new; end if;
  select c.source_fixes into prev
    from campers c
   where c.source_id = new.source_id and c.session_id <> new.session_id and c.source_fixes <> '{}'::jsonb
   order by c.created_at desc
   limit 1;
  if prev is null then return new; end if;
  -- only fixes the registration still needs: it says the same as when it was fixed
  select coalesce(jsonb_object_agg(f.key, f.value), '{}'::jsonb) into new.source_fixes
    from jsonb_each(prev) f
   where exists (
     select 1 from jsonb_each_text(coalesce(new.source_data, '{}'::jsonb)) s
      where column_key(s.key) = column_key(f.key) and btrim(s.value) = btrim(coalesce(f.value->>'was', ''))
   );
  return new;
end $$;

drop trigger if exists campers_carry_fixes on campers;
create trigger campers_carry_fixes before insert on campers
  for each row execute function campers_carry_source_fixes();
