-- The address twice: the form's (ppa.*) and the family record's (family.*), both shown as "City"…
insert into imports (id, session_id, file_name, file_path, status, options) values
  ('c0330000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'z.csv', '', 'applied',
   '{"headers": ["students.id", "ppa.city", "family.city", "family.state", "family.country"]}');
insert into merge_fields (key, label, source_field) values ('FROM_TEST', 'From', '{{source.ppa.city}}, {{source.ppa.state}} {{source.ppa.country}} {{source.ppa.city_note}}')
  on conflict (key) do nothing;
insert into settings (key, value) values ('extra_fields',
  '[{"column": "ppa.city", "label": "City"}, {"column": "ppa.state", "label": "State"}, {"column": "family.city", "label": "City"}, {"column": "ppa.bus_route", "label": "Bus"}]')
  on conflict (key) do update set value = excluded.value;
