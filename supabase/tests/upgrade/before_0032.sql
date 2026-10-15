-- Export columns stored under two spellings of one name.
insert into campers (id, session_id, first_name, last_name, source_data) values
  ('c0320000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Two', 'Spellings',
   '{"family.city": "", "Family.City": "Brooklyn", "family#state": "NY", "ppa.size": "M"}');
insert into imports (id, session_id, file_name, file_path, status, options) values
  ('c0320000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'y.csv', '', 'applied',
   '{"headers": ["students.id", "family.city", "Family.City", "family#state", "Family.State"]}');
