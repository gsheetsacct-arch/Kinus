-- =============================================================================
-- Kinus — 0063: a buzzer number belongs to one camper
--   * An archived camper who comes back in a new export (0062) gives up their old buzzer number
--     when someone else has it now (everyone was renumbered while they were archived): they
--     come back without one, and "Number the ones without one" gives them a new number at the
--     end. apply_import is otherwise as in 0062.
--   * Once, for the numbers already doubled that way: the camper who came back gets the next
--     number after the highest (their buzzer label prints again with it), and archived campers
--     holding a number someone else has give it up. Safe to run again.
-- =============================================================================

create or replace function apply_import(p_import_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  result jsonb;
  n_back int := 0;
begin
  -- the import as before (its checks, its changes, and its audit source for Undo)
  result := apply_import_rows(p_import_id);
  -- still in this transaction, under the same audit source: Undo puts them back to archived.
  -- A number someone else has now isn't theirs any more.
  update campers c set archived_at = null,
      current_buzzer_number = case
        when c.current_buzzer_number is not null and exists (
          select 1 from campers o
          where o.session_id = c.session_id and o.id <> c.id and o.archived_at is null
            and o.current_buzzer_number = c.current_buzzer_number)
        then null else c.current_buzzer_number end
    from import_rows ir
    where ir.import_id = p_import_id
      and ir.matched_camper_id = c.id
      and c.archived_at is not null
      and ir.changes @> '[{"field": "archived"}]'::jsonb;
  get diagnostics n_back = row_count;
  return coalesce(result, '{}'::jsonb) || jsonb_build_object('restored', n_back);
end $$;

revoke all on function apply_import_rows(uuid) from public, anon, authenticated;
grant execute on function apply_import(uuid) to authenticated, service_role;

-- once: the camper brought back with a number that was renumbered to someone else (0426, buzzer
-- 496, also 0200's since everyone was renumbered on 5 Nov) gets the next number at the end
do $$
declare
  s uuid;
  c record;
  nxt int;
begin
  select id into s from sessions where is_active limit 1;
  if s is null then return; end if;
  for c in
    select x.id from campers x
    where x.session_id = s and x.archived_at is null and x.camper_code = '0426'
      and x.current_buzzer_number is not null
      and exists (select 1 from campers o where o.session_id = s and o.id <> x.id and o.archived_at is null and o.current_buzzer_number = x.current_buzzer_number)
  loop
    select coalesce(max(current_buzzer_number), 0) + 1 into nxt from campers where session_id = s;
    update campers set current_buzzer_number = nxt where id = c.id;
  end loop;
  -- archived campers holding a number someone here has: they give it up
  update campers a set current_buzzer_number = null
    where a.session_id = s and a.archived_at is not null and a.current_buzzer_number is not null
      and exists (select 1 from campers o where o.session_id = s and o.archived_at is null and o.current_buzzer_number = a.current_buzzer_number);
end $$;
