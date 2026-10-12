-- =============================================================================
-- Kinus — 0026: start a new session from the last one's setup.
-- copy_session_setup(from, to) copies the camps, divisions (name, language, colour,
-- order, camp) and bunks (name, order) into the new session, and, with p_staff, gives
-- staff the same camps, divisions and bunks there. Campers are never copied: the
-- import brings them in and finds these divisions and bunks by name. Anything already
-- in the new session with the same name (an import ran first) takes last session's
-- settings: camp, language, colour and order.
-- =============================================================================
create or replace function copy_session_setup(p_from uuid, p_to uuid, p_staff boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g record; d record; b record; s record;
  gmap jsonb := '{}'; dmap jsonb := '{}'; bmap jsonb := '{}';
  nid uuid; n_groups int := 0; n_divs int := 0; n_bunks int := 0; n_staff int := 0;
begin
  if not is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_from = p_to then raise exception 'Choose a different session to copy from.'; end if;

  for g in select * from division_groups where session_id = p_from order by sort_order loop
    select id into nid from division_groups where session_id = p_to and lower(name) = lower(g.name);
    if nid is null then
      insert into division_groups (session_id, name, sort_order) values (p_to, g.name, g.sort_order) returning id into nid;
      n_groups := n_groups + 1;
    end if;
    gmap := gmap || jsonb_build_object(g.id::text, nid);
  end loop;

  for d in select * from divisions where session_id = p_from order by sort_order loop
    select id into nid from divisions where session_id = p_to and name = d.name;
    if nid is null then
      insert into divisions (session_id, name, language, color, sort_order, group_id)
        values (p_to, d.name, d.language, d.color, d.sort_order, (gmap ->> d.group_id::text)::uuid)
        returning id into nid;
      n_divs := n_divs + 1;
    else
      -- already there (an import ran first): give it last session's settings
      update divisions set language = d.language, color = coalesce(d.color, color), sort_order = d.sort_order,
             group_id = coalesce((gmap ->> d.group_id::text)::uuid, group_id)
       where id = nid;
    end if;
    dmap := dmap || jsonb_build_object(d.id::text, nid);
  end loop;

  for b in select bk.* from bunks bk join divisions dv on dv.id = bk.division_id where dv.session_id = p_from order by bk.sort_order loop
    select id into nid from bunks where division_id = (dmap ->> b.division_id::text)::uuid and name = b.name;
    if nid is null then
      insert into bunks (division_id, name, sort_order) values ((dmap ->> b.division_id::text)::uuid, b.name, b.sort_order) returning id into nid;
      n_bunks := n_bunks + 1;
    else
      update bunks set sort_order = b.sort_order where id = nid;
    end if;
    bmap := bmap || jsonb_build_object(b.id::text, nid);
  end loop;

  if p_staff then
    for s in
      select sc.* from staff_scopes sc join profiles p on p.id = sc.user_id and p.is_active
      where (sc.group_id is not null and gmap ? sc.group_id::text) or (sc.division_id is not null and dmap ? sc.division_id::text)
    loop
      insert into staff_scopes (user_id, group_id, division_id, bunk_id, created_by)
      values (s.user_id, (gmap ->> s.group_id::text)::uuid, (dmap ->> s.division_id::text)::uuid, (bmap ->> s.bunk_id::text)::uuid, auth.uid())
      on conflict do nothing;
      if found then n_staff := n_staff + 1; end if;
    end loop;
  end if;

  return jsonb_build_object('camps', n_groups, 'divisions', n_divs, 'bunks', n_bunks, 'staff', n_staff);
end $$;
revoke execute on function copy_session_setup(uuid, uuid, boolean) from public, anon;
grant execute on function copy_session_setup(uuid, uuid, boolean) to authenticated;
