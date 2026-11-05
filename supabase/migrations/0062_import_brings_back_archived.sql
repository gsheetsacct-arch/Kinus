-- =============================================================================
-- Kinus — 0062: an archived camper who is in a new export comes back
--   * The preview lists it as a change ("archived": Archived → Back). Applying the import now
--     clears archived_at for every camper whose row lists that change, inside the same apply,
--     so the activity log records it under the import and Undo archives them again.
--   * apply_import itself is unchanged: it's renamed apply_import_rows, and apply_import runs
--     it and then brings the archived campers back. Safe to run again.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'apply_import_rows') then
    alter function apply_import(uuid) rename to apply_import_rows;
  end if;
end $$;

create or replace function apply_import(p_import_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  result jsonb;
  n_back int := 0;
begin
  -- the import as before (its checks, its changes, and its audit source for Undo)
  result := apply_import_rows(p_import_id);
  -- still in this transaction, under the same audit source: Undo puts them back to archived
  update campers c set archived_at = null
    from import_rows ir
    where ir.import_id = p_import_id
      and ir.matched_camper_id = c.id
      and c.archived_at is not null
      and ir.changes @> '[{"field": "archived"}]'::jsonb;
  get diagnostics n_back = row_count;
  return coalesce(result, '{}'::jsonb) || jsonb_build_object('restored', n_back);
end $$;

-- the same callers as before; the inner one only through apply_import
revoke all on function apply_import_rows(uuid) from public, anon, authenticated;
grant execute on function apply_import(uuid) to authenticated, service_role;
