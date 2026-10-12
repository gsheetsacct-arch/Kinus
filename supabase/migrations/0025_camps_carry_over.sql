-- =============================================================================
-- Kinus — 0025: a new session remembers the camps.
-- A division that existed in an earlier session (same name) goes into the camp of the
-- same name it was in last time (created in the new session if needed, in the same
-- order). Only divisions never seen before fall back to the name rule (Hebrew/French
-- in the name, else the main camp).
-- =============================================================================
create or replace function camp_for_division(p_session_id uuid, p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  prev record;
  kind text;
  gid uuid;
begin
  -- the same division in the most recent earlier session that had it in a camp
  select g.name, g.sort_order into prev
    from divisions d
    join division_groups g on g.id = d.group_id
    join sessions s on s.id = d.session_id
   where d.session_id <> p_session_id and lower(btrim(d.name)) = lower(btrim(p_name))
   order by s.created_at desc
   limit 1;
  if found then
    select id into gid from division_groups where session_id = p_session_id and lower(name) = lower(prev.name) limit 1;
    if gid is null then
      insert into division_groups (session_id, name, sort_order) values (p_session_id, prev.name, prev.sort_order) returning id into gid;
    end if;
    return gid;
  end if;

  kind := case
    when p_name ~* '(hebrew|ivrit|עברית)' then 'Hebrew'
    when p_name ~* '(french|fran[cç]ais)' then 'French'
  end;
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
revoke execute on function camp_for_division(uuid, text) from public, anon, authenticated;
