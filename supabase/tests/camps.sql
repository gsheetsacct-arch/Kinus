\set ON_ERROR_STOP on
-- Camps: new divisions (e.g. from an import) land in the right camp by name.
insert into sessions (id, name, is_active) values ('10000000-0000-0000-0000-000000000001', 'S', true);
insert into divisions (session_id, name) values
  ('10000000-0000-0000-0000-000000000001', 'Division 1'),
  ('10000000-0000-0000-0000-000000000001', 'French Division'),
  ('10000000-0000-0000-0000-000000000001', 'Division 3'),
  ('10000000-0000-0000-0000-000000000001', 'מחנה עברית'),
  ('10000000-0000-0000-0000-000000000001', 'Hebrew Division B');
do $$
begin
  assert (select count(*) from division_groups) = 3, 'three camps';
  assert (select string_agg(d.name, ',' order by d.name) from divisions d join division_groups g on g.id = d.group_id where g.name = 'American') = 'Division 1,Division 3';
  assert (select count(*) from divisions d join division_groups g on g.id = d.group_id where g.name = 'Hebrew') = 2, 'both Hebrew divisions';
  assert (select sort_order from division_groups where name = 'American') = 0, 'American first';
end $$;
-- a camp an admin made and named themselves is used for main-camp divisions
insert into sessions (id, name) values ('10000000-0000-0000-0000-000000000002', 'T');
insert into division_groups (session_id, name, sort_order) values ('10000000-0000-0000-0000-000000000002', 'Main camp', 0);
insert into divisions (session_id, name) values ('10000000-0000-0000-0000-000000000002', 'Division 2'), ('10000000-0000-0000-0000-000000000002', 'French');
do $$
begin
  assert (select g.name from divisions d join division_groups g on g.id = d.group_id where d.session_id = '10000000-0000-0000-0000-000000000002' and d.name = 'Division 2') = 'Main camp';
  assert (select g.name from divisions d join division_groups g on g.id = d.group_id where d.session_id = '10000000-0000-0000-0000-000000000002' and d.name = 'French') = 'French';
  -- choosing a camp explicitly is respected
  insert into divisions (session_id, name, group_id) select '10000000-0000-0000-0000-000000000002', 'French staff kids', id from division_groups where name = 'Main camp';
  assert (select g.name from divisions d join division_groups g on g.id = d.group_id where d.name = 'French staff kids') = 'Main camp';
end $$;
