-- =============================================================================
-- Kinus — 0055: searching (the Search page)
--   search_camper_columns: campers of a session whose export columns (or the fixes made in
--     Kinus) contain the text, with the column and its value; the app shows only the
--     columns and campers the person may see.
--   search_audit: the activity log's entries that mention the text anywhere (what was
--     recorded, the page, the row's key) or were made by these people, newest first.
--   Server only: the app checks who may search what first.
-- =============================================================================

create or replace function search_camper_columns(p_session_id uuid, p_pattern text, p_limit int default 200)
returns table (camper_id uuid, key text, value text)
language sql stable security definer set search_path = public as $$
  select c.id, e.key, e.value
  from campers c
  cross join lateral (
    select s.key, s.value
      from jsonb_each_text(case when jsonb_typeof(c.source_data) = 'object' then c.source_data else '{}'::jsonb end) s
    union all
    select f.key, f.value->>'value'
      from jsonb_each(case when jsonb_typeof(c.source_fixes) = 'object' then c.source_fixes else '{}'::jsonb end) f
  ) e
  where c.session_id = p_session_id and c.archived_at is null and e.value ilike p_pattern
  limit greatest(1, least(p_limit, 1000))
$$;
revoke all on function search_camper_columns(uuid, text, int) from public, anon, authenticated;
grant execute on function search_camper_columns(uuid, text, int) to service_role;

create or replace function search_audit(p_pattern text, p_actor_ids uuid[] default '{}', p_before bigint default null, p_limit int default 60)
returns setof audit_log
language sql stable security definer set search_path = public as $$
  select a.* from audit_log a
  where (p_before is null or a.id < p_before)
    and (a.after::text ilike p_pattern or a.before::text ilike p_pattern or a.via ilike p_pattern
         or a.row_key ilike p_pattern or a.table_name ilike p_pattern or a.action ilike p_pattern
         or a.actor_id = any(p_actor_ids))
  order by a.id desc
  limit greatest(1, least(p_limit, 500))
$$;
revoke all on function search_audit(text, uuid[], bigint, int) from public, anon, authenticated;
grant execute on function search_audit(text, uuid[], bigint, int) to service_role;
