-- =============================================================================
-- Kinus — 0056: template folders
--   Templates can be put in a folder (by its name) on Print → Templates, or by the design
--   connector's organize_templates; null is "not in a folder".
-- =============================================================================
alter table print_templates add column if not exists folder text;
