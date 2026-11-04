-- =============================================================================
-- Kinus — 0059: undoing an import finds its changes quickly
--   * revert_import reads the activity log by source ('import:<id>') twice; with no index on
--     source, each read went through the whole log (seconds, and more as it grows), so undoing a
--     big import ran out of time. An index on source, newest first, as the undo reads it.
-- =============================================================================

create index if not exists audit_log_source on audit_log (source, id desc);
