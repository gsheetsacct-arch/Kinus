-- =============================================================================
-- Kinus — 0041: templates for staff (name tags, badges…), printed from Print → Staff tags
--   * audience: who a template is for. Camper templates are offered everywhere campers print
--     (camper cards, first check-in, batches, the queue); staff templates only on Staff tags,
--     filled from the staff list (name, position, division, bunk, phone, registration details).
-- =============================================================================
alter table print_templates add column if not exists audience text not null default 'campers';
alter table print_templates drop constraint if exists print_templates_audience_check;
alter table print_templates add constraint print_templates_audience_check check (audience in ('campers', 'staff'));
comment on column print_templates.audience is 'campers (the default) or staff: what the template is filled from and where it is offered.';
