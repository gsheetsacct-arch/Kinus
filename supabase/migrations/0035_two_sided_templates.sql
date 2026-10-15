-- =============================================================================
-- Kinus — 0035: two-sided templates
--   * print_templates.back: set when a template prints on both sides:
--       { "flip": "long" | "short", "shiftXMm": 0, "shiftYMm": 0 }
--     The parts of the back are in `layers` with "side": "back". On label sheets the back
--     page is laid out mirrored, so each back lands exactly behind its front.
-- =============================================================================

alter table print_templates add column if not exists back jsonb;
comment on column print_templates.back is 'Two-sided: which edge the paper turns on (long/short) and a nudge for the back; null = one side.';
