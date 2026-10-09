-- =============================================================================
-- Kinus — 0007: camps
--   Division groups become camps: American (Divisions 1–3, Bar Mitzvah Program),
--   Hebrew and French run almost separately. Every division belongs to a camp;
--   the first camp (lowest sort_order) is where everyone starts.
-- =============================================================================

-- Which camp a division belongs to by its name, when nobody chose one.
create or replace function camp_for_division(p_session_id uuid, p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  kind text := case
    when p_name ~* '(hebrew|ivrit|עברית)' then 'Hebrew'
    when p_name ~* '(french|fran[cç]ais)' then 'French'
  end;
  gid uuid;
begin
  if kind is not null then
    select id into gid from division_groups where session_id = p_session_id and name ilike kind || '%' order by sort_order limit 1;
    if gid is null then
      insert into division_groups (session_id, name, sort_order)
      values (p_session_id, kind, coalesce((select max(sort_order) + 1 from division_groups where session_id = p_session_id), 1))
      returning id into gid;
    end if;
    return gid;
  end if;
  -- everything else goes to the main camp: the first one, or a new "American"
  select id into gid from division_groups
   where session_id = p_session_id and name !~* '^(hebrew|french)'
   order by sort_order, name limit 1;
  if gid is null then
    insert into division_groups (session_id, name, sort_order) values (p_session_id, 'American', 0) returning id into gid;
  end if;
  return gid;
end $$;

create or replace function divisions_assign_camp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.group_id is null then new.group_id := camp_for_division(new.session_id, new.name); end if;
  return new;
end $$;

drop trigger if exists divisions_assign_camp on divisions;
create trigger divisions_assign_camp before insert on divisions for each row execute function divisions_assign_camp();

-- Existing divisions: main-camp divisions first so "American" gets the lowest sort order.
do $$
declare d record;
begin
  for d in
    select id, session_id, name from divisions where group_id is null
    order by session_id, (name ~* '(hebrew|ivrit|עברית|french|fran[cç]ais)'), sort_order, name
  loop
    update divisions set group_id = camp_for_division(d.session_id, d.name) where id = d.id;
  end loop;
end $$;

-- only the trigger uses these (it runs as owner); not callable through the API
revoke execute on function camp_for_division(uuid, text) from public, anon, authenticated;
revoke execute on function divisions_assign_camp() from public, anon, authenticated;
