-- Export columns as kept between 0030 and 0031: repeated names stored as "(2)" copies.
insert into campers (id, session_id, first_name, last_name, source_data) values
  ('c0310000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Copy', 'Camper',
   '{"family.city": "Brooklyn", "family.city (2)": "Toronto", "family.state": "NY", "family.state (2)": "", "ppa.size (3)": "only copy"}');
insert into imports (id, session_id, file_name, file_path, status, options) values
  ('c0310000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'x.csv', '', 'applied',
   '{"headers": ["students.id", "family.city", "family.state", "family.city (2)", "family.state (2)"]}');
insert into settings (key, value) values ('extra_fields', '[{"column": "family.city", "label": "City"}, {"column": "family.city (2)", "label": "City (2)"}]')
  on conflict (key) do update set value = excluded.value;
