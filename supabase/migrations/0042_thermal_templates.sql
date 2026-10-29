-- =============================================================================
-- Kinus — 0042: templates for thermal label printers (Zebra, Rollo, MUNBYN…)
--   * thermal: printed in black and white only (every colour solid black or white, codes
--     black, pictures black and white), and a label wider than tall goes on a page turned
--     the way the printer feeds it, so a 4″ × 6″ label is a 4″ × 6″ page (lib/print/thermal).
--   * A ready-made 4″ × 6″ luggage tag for a thermal printer to start from (portrait, the
--     way the label comes out of the printer).
-- =============================================================================
alter table print_templates add column if not exists thermal boolean not null default false;
comment on column print_templates.thermal is 'For a thermal label printer: black and white only, one label a page at the label''s size.';

insert into print_templates (id, kind, name, page_width_mm, page_height_mm, layers, sheet_layout, is_default, show_on_card, auto_on_first_checkin, sort_order, thermal) values
  ('d0000000-0000-0000-0000-000000000042', 'luggage_tag', 'Luggage tag 4×6 (thermal)', 101.6, 152.4, '[
     {"id":"band","type":"box","x":0,"y":0,"w":101.6,"h":14,"fill":"#000000"},
     {"id":"camp","type":"text","text":"{{DIVISION}}","x":5,"y":2,"w":91.6,"h":10,"size":20,"weight":700,"align":"center","color":"#ffffff","fit":true},
     {"id":"first","type":"text","text":"{{FIRST}}","x":5,"y":20,"w":91.6,"h":22,"size":44,"weight":700,"align":"center","fit":true},
     {"id":"last","type":"text","text":"{{LAST}}","x":5,"y":42,"w":91.6,"h":14,"size":26,"weight":400,"align":"center","fit":true},
     {"id":"bunk","type":"text","text":"{{BUNK}}","x":5,"y":58,"w":91.6,"h":12,"size":22,"weight":700,"align":"center","fit":true},
     {"id":"rule","type":"box","x":5,"y":74,"w":91.6,"h":0.8,"fill":"#000000"},
     {"id":"code","type":"qr","text":"{{BARCODE}}","x":25.8,"y":82,"w":50,"h":50},
     {"id":"num","type":"text","text":"{{CODE}}","x":5,"y":134,"w":91.6,"h":10,"size":18,"weight":700,"align":"center","fit":true}
   ]', null, false, false, false, 90, true)
on conflict (id) do nothing;
