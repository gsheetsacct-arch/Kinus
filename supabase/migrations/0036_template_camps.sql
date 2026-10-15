-- =============================================================================
-- Kinus — 0036: templates for some camps only
--   * print_templates.camps: the camps (by name: American, Hebrew…) a template is for, so it
--     carries over to next session's camps. Empty: every camp. Print a batch, the camper
--     card's buttons, printing at first check-in and "new or changed labels" only use a
--     template for campers in its camps.
-- =============================================================================

alter table print_templates add column if not exists camps text[] not null default '{}';
comment on column print_templates.camps is 'Camps (division group names) this template is for; empty = every camp.';
