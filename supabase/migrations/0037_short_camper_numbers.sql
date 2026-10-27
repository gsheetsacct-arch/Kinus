-- =============================================================================
-- Kinus — 0037: short camper numbers (0001, 0002…)
--   * New campers get the next short number: 4 digits from 0001 (5 past 9999), never one
--     a camper had or has. Numbers carry on from session to session, so last year's tag can
--     never check in a different child.
--   * campers.former_code: the long number (100016…) a camper had before getting a short
--     one. Tags already printed with it still scan and look up.
--   * renumber_camper_codes(ids): gives these campers (in this order) short numbers, keeping
--     their long ones as former_code. Only campers that still have a long number; only from
--     the server (Print → Batch, directors over all of camp), in division, bunk, name order.
-- =============================================================================

alter table campers add column if not exists former_code text;
comment on column campers.former_code is 'The long camper code (100016…) before the short number; old tags still scan.';
create index if not exists campers_former_code_idx on campers (former_code) where former_code is not null;
grant select (former_code) on campers to authenticated;

create sequence if not exists camper_number_seq start 1;

-- as the owner: sees every camper (whatever the inserting user may see) and the sequence
create or replace function next_camper_code() returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  loop
    c := lpad(nextval('camper_number_seq')::text, 4, '0');
    exit when not exists (select 1 from campers where camper_code = c or former_code = c);
  end loop;
  return c;
end $$;

create or replace function renumber_camper_codes(p_ids uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; i uuid;
begin
  foreach i in array p_ids loop
    update campers set former_code = camper_code, camper_code = next_camper_code()
     where id = i and former_code is null and length(camper_code) >= 6;
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke execute on function renumber_camper_codes(uuid[]) from public, anon, authenticated;
grant execute on function renumber_camper_codes(uuid[]) to service_role;
