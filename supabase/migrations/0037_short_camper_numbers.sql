-- =============================================================================
-- Kinus — 0037: short camper numbers, 0001 and up in each session
--   * A new camper gets the session's next number: 4 digits from 0001 (5 past 9999), one
--     more than the highest in the session (archived campers keep theirs). Numbers are
--     unique within a session (no longer across sessions): every session starts at 0001.
--   * Campers from before keep their long numbers (100016…); a session whose campers are
--     deleted and imported again starts at 0001.
-- =============================================================================

-- (safe to run again, also over the first version of this migration)
drop function if exists renumber_camper_codes(uuid[]);
alter table campers drop column if exists former_code;
drop sequence if exists camper_number_seq;

alter table campers drop constraint if exists campers_camper_code_key;
create unique index if not exists campers_session_code_key on campers (session_id, camper_code);
alter table campers alter column camper_code drop default;
drop function if exists next_camper_code();

-- as the owner: sees every camper of the session, whatever the inserting user may see
create or replace function next_camper_code(p_session uuid) returns text
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  -- one at a time per session (two imports at once never get the same number)
  perform pg_advisory_xact_lock(hashtext('camper_code:' || p_session::text));
  select coalesce(max(camper_code::int), 0) + 1 into n
    from campers where session_id = p_session and camper_code ~ '^\d{4,5}$';
  return lpad(n::text, 4, '0');
end $$;

create or replace function set_camper_code() returns trigger
language plpgsql as $$
begin
  if new.camper_code is null or new.camper_code = '' then new.camper_code := next_camper_code(new.session_id); end if;
  return new;
end $$;

drop trigger if exists campers_set_code on campers;
create trigger campers_set_code before insert on campers for each row execute function set_camper_code();
