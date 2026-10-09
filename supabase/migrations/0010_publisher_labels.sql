-- =============================================================================
-- Kinus — 0010: the 4×6 labels from Publisher (labels_4x6_template.pub and
-- labels_small_template.pub), rebuilt as Kinus templates, with the merge fields
-- they use. Publisher's «ppa#hebrew_name» etc. read the same export columns here
-- ("source.<column>"); «camper_id» became a scannable barcode up the left side.
-- =============================================================================

insert into merge_fields (key, label, source_field, transforms, sort_order) values
  ('HEB_FIRST',   'Hebrew name',        '{{source.ppa.hebrew_name}}',       '[]', 20),
  ('HEB_LAST',    'Hebrew last name',   '{{source.ppa.hebrew_last_name}}',  '[]', 21),
  ('YARMULKA',    'Yarmulka size',      '{{source.ppa.yarmulka_size}}',     '[]', 22),
  -- «F88», «F89» «F90» in Publisher: city, state country (tidied when a part is missing)
  ('FROM',        'From (city, state country)', '{{source.ppa.city}}, {{source.ppa.state}} {{source.ppa.country}}',
     '[{"type":"replace","pattern":"\\s*,\\s*(?=,|$)","replacement":"","flags":"g"},
       {"type":"replace","pattern":"^\\s*,\\s*","replacement":"","flags":""},
       {"type":"replace","pattern":",\\s+","replacement":", ","flags":"g"},
       {"type":"replace","pattern":"\\s{2,}","replacement":" ","flags":"g"}]', 23),
  -- «bunk hebrew»: the Hebrew bunk where there is one, else the bunk
  ('BUNK_HEBREW', 'Bunk (Hebrew where there is one)', '{{source.group_types.hebrew_bunks|bunk}}',
     '[{"type":"replace","pattern":"^Bunk\\s+","replacement":"","flags":"i"}]', 24),
  -- «F15»: the big bunk on the right
  ('BUNK_BIG',    'Bunk, big on labels', 'bunk',
     '[{"type":"replace","pattern":"^Bunk\\s+","replacement":"","flags":"i"}]', 25)
on conflict (key) do nothing;

insert into print_templates (id, kind, name, page_width_mm, page_height_mm, layers, is_default, show_on_card, auto_on_first_checkin, sort_order) values
  ('d0000000-0000-0000-0000-000000000003', 'other', 'Label 4×6 (Hebrew name)', 152.4, 101.6, '[
     {"id":"code","type":"barcode","text":"{{BARCODE}}","x":2,"y":4,"w":12,"h":52,"showText":true,"rotate":-90},
     {"id":"heb_first","type":"text","text":"{{HEB_FIRST}}","x":16,"y":3.5,"w":132,"h":13,"size":30,"weight":700,"align":"center","fit":true},
     {"id":"heb_last","type":"text","text":"{{HEB_LAST}}","x":16,"y":16.5,"w":132,"h":13,"size":30,"weight":700,"align":"center","fit":true},
     {"id":"name","type":"text","text":"{{LAST}}, {{FIRST}}","x":16,"y":30,"w":132,"h":8,"size":15,"align":"center","fit":true},
     {"id":"from","type":"text","text":"{{FROM}}","x":16,"y":43,"w":132,"h":12,"size":24,"align":"center","fit":true},
     {"id":"bunk","type":"text","text":"Bunk {{BUNK_HEBREW}}","x":8,"y":60,"w":90,"h":14,"size":30,"align":"left","fit":true},
     {"id":"division","type":"text","text":"{{DIVISION}}","x":8,"y":74,"w":90,"h":8,"size":15,"align":"left","fit":true},
     {"id":"tshirt","type":"text","text":"T-shirt: {{TSHIRT}}","x":8,"y":82.5,"w":90,"h":6.5,"size":12,"align":"left","color":"#444444","fit":true},
     {"id":"yarmulka","type":"text","text":"Yarmulka: {{YARMULKA}}","x":8,"y":89,"w":90,"h":6.5,"size":12,"align":"left","color":"#444444","fit":true},
     {"id":"bunk_label","type":"text","text":"Bunk","x":102,"y":58,"w":46,"h":7,"size":13,"align":"center","color":"#777777","fit":true},
     {"id":"bunk_big","type":"text","text":"{{BUNK_BIG}}","x":100,"y":64,"w":50,"h":34,"size":80,"align":"center","color":"#6b7280","fit":true}
   ]', false, true, false, 3),
  ('d0000000-0000-0000-0000-000000000004', 'other', 'Label 4×6 (English name)', 152.4, 101.6, '[
     {"id":"code","type":"barcode","text":"{{BARCODE}}","x":2,"y":4,"w":12,"h":52,"showText":true,"rotate":-90},
     {"id":"last","type":"text","text":"{{LAST}},","x":16,"y":12,"w":132,"h":12,"size":28,"weight":700,"align":"center","fit":true},
     {"id":"first","type":"text","text":"{{FIRST}}","x":16,"y":24,"w":132,"h":12,"size":28,"weight":700,"align":"center","fit":true},
     {"id":"from","type":"text","text":"{{FROM}}","x":16,"y":42,"w":132,"h":12,"size":24,"align":"center","fit":true},
     {"id":"bunk","type":"text","text":"Bunk {{BUNK_HEBREW}}","x":8,"y":60,"w":90,"h":14,"size":30,"align":"left","fit":true},
     {"id":"division","type":"text","text":"{{DIVISION}}","x":8,"y":74,"w":90,"h":8,"size":15,"align":"left","fit":true},
     {"id":"tshirt","type":"text","text":"T-shirt: {{TSHIRT}}","x":8,"y":82.5,"w":90,"h":6.5,"size":12,"align":"left","color":"#444444","fit":true},
     {"id":"yarmulka","type":"text","text":"Yarmulka: {{YARMULKA}}","x":8,"y":89,"w":90,"h":6.5,"size":12,"align":"left","color":"#444444","fit":true},
     {"id":"bunk_label","type":"text","text":"Bunk","x":102,"y":58,"w":46,"h":7,"size":13,"align":"center","color":"#777777","fit":true},
     {"id":"bunk_big","type":"text","text":"{{BUNK_BIG}}","x":100,"y":64,"w":50,"h":34,"size":80,"align":"center","color":"#6b7280","fit":true}
   ]', false, true, false, 4)
on conflict (id) do nothing;
