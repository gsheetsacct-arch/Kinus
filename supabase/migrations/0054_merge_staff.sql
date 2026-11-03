-- =============================================================================
-- Kinus — 0054: merge two staff records of the same person
--   Someone added by hand (with a sign-in) and again by the staff import (listed only, with
--   the registration's phone and details) becomes one person: the one kept gets the
--   other's areas, the registration link (so later imports update them), address and
--   details, the phone chosen, and everything the other recorded (check-ins, prints,
--   texts…). The other's record is then removed by the app (with its sign-in, if any).
--   Server only (the app checks who may merge first).
-- =============================================================================

create or replace function merge_profiles(p_keep uuid, p_drop uuid, p_phone text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  k profiles;
  d profiles;
  c record;
begin
  if p_keep = p_drop then raise exception 'Choose two different people.'; end if;
  select * into k from profiles where id = p_keep for update;
  select * into d from profiles where id = p_drop for update;
  if k.id is null or d.id is null then raise exception 'One of these people is gone. Reload the page.'; end if;
  perform set_config('kinus.audit_source', 'merge:' || p_drop::text, true);

  -- where they work: the kept person's areas, and any more the other had
  insert into staff_scopes (user_id, group_id, division_id, bunk_id)
    select p_keep, s.group_id, s.division_id, s.bunk_id from staff_scopes s
    where s.user_id = p_drop
      and not exists (select 1 from staff_scopes t where t.user_id = p_keep
                        and t.group_id is not distinct from s.group_id
                        and t.division_id is not distinct from s.division_id
                        and t.bunk_id is not distinct from s.bunk_id);
  delete from staff_scopes where user_id = p_drop;

  -- everything else that points at the other record (who recorded, printed, texted…)
  for c in
    select cl.relname as tbl, a.attname as col
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid
    join pg_namespace n on n.oid = cl.relnamespace and n.nspname = 'public'
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
    where con.contype = 'f' and con.confrelid = 'public.profiles'::regclass
      and array_length(con.conkey, 1) = 1 and cl.relname not in ('staff_scopes', 'profiles')
  loop
    begin
      execute format('update %I set %I = $1 where %I = $2', c.tbl, c.col, c.col) using p_keep, p_drop;
    exception when unique_violation then
      -- the kept person already has that row (a text both got): the copy goes
      execute format('delete from %I where %I = $1', c.tbl, c.col) using p_drop;
    end;
  end loop;

  -- the details: the registration link moves over; nothing the kept person has is lost
  update profiles set source_id = null where id = p_drop;
  update profiles set
    phone = coalesce(nullif(trim(p_phone), ''), nullif(k.phone, ''), d.phone),
    title = coalesce(nullif(k.title, ''), d.title),
    source_id = coalesce(k.source_id, d.source_id),
    address = coalesce(k.address, d.address),
    details = case when k.details is null and d.details is null then null
                   else coalesce(d.details, '{}'::jsonb) || coalesce(k.details, '{}'::jsonb) end
  where id = p_keep;
end $$;

revoke execute on function merge_profiles(uuid, uuid, text) from public, anon, authenticated;
grant execute on function merge_profiles(uuid, uuid, text) to service_role;
