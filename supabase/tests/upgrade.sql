-- Data seeded by upgrade/before_*.sql came through every migration.
do $$
declare r record;
begin
  select role, access_level, all_areas into r from profiles where email = 'owner@x.test';
  assert r.role = 'owner' and r.all_areas, 'owner kept';
  select role, access_level, all_areas into r from profiles where email = 'head@x.test';
  assert r.role = 'division_head' and r.access_level = 'edit' and not r.all_areas, format('head converted: %s', r);
  assert (select count(*) from staff_scopes s join profiles p on p.id = s.user_id where p.email = 'head@x.test') = 2, 'duplicate division row merged, bunk row kept';
  select role, access_level, all_areas into r from profiles where email = 'admin@x.test';
  assert r.role = 'director' and r.all_areas, 'admin became director over all of camp';
  select role, access_level into r from profiles where email = 'nobody@x.test';
  assert r.role = 'counselor' and r.access_level = 'scan', format('no scopes -> counselor/scan: %s', r);
end $$;

-- 0007: existing divisions were put into camps, American first.
do $$
begin
  assert (select string_agg(g.name, ',' order by g.sort_order) from division_groups g where g.session_id = 'a1000000-0000-0000-0000-000000000001') = 'American,Hebrew,French',
    (select string_agg(g.name || ':' || g.sort_order, ',') from division_groups g);
  assert (select string_agg(d.name, ',' order by d.name) from divisions d join division_groups g on g.id = d.group_id where g.name = 'American') = 'Bar Mitzvah Program,Division 1';
  assert not exists (select 1 from divisions where group_id is null), 'every division has a camp';
end $$;

-- 0031: "(2)" copies of repeated columns are gone; columns of their own stay.
do $$
begin
  assert (select source_data from campers where id = 'c0310000-0000-0000-0000-000000000001')
    = '{"family.city": "Brooklyn", "family.state": "NY", "ppa.size (3)": "only copy"}'::jsonb,
    (select source_data::text from campers where id = 'c0310000-0000-0000-0000-000000000001');
  assert (select options->'headers' from imports where id = 'c0310000-0000-0000-0000-000000000002')
    = '["students.id", "family.city", "family.state"]'::jsonb;
  -- (0031's extra fields: checked after 0033 below, which seeds them again)
end $$;

-- 0032: one key per column whatever the spelling, the filled-in copy kept.
do $$
begin
  assert (select source_data from campers where id = 'c0320000-0000-0000-0000-000000000001')
    = '{"Family.City": "Brooklyn", "family#state": "NY", "ppa.size": "M"}'::jsonb,
    (select source_data::text from campers where id = 'c0320000-0000-0000-0000-000000000001');
  assert (select options->'headers' from imports where id = 'c0320000-0000-0000-0000-000000000002')
    = '["students.id", "family.city", "family#state"]'::jsonb,
    (select (options->'headers')::text from imports where id = 'c0320000-0000-0000-0000-000000000002');
  -- 0031's camper is untouched (no two spellings)
  assert (select source_data from campers where id = 'c0310000-0000-0000-0000-000000000001')
    = '{"family.city": "Brooklyn", "family.state": "NY", "ppa.size (3)": "only copy"}'::jsonb;
end $$;

-- 0033: city, state and country from the family record only.
do $$
begin
  assert (select source_field from merge_fields where key = 'FROM_TEST')
    = '{{source.family.city}}, {{source.family.state}} {{source.family.country}} {{source.ppa.city_note}}',
    (select source_field from merge_fields where key = 'FROM_TEST');
  assert (select value from settings where key = 'extra_fields')
    = '[{"column": "family.city", "label": "City"}, {"column": "family.state", "label": "State"}, {"column": "ppa.bus_route", "label": "Bus"}]'::jsonb,
    (select value::text from settings where key = 'extra_fields');
  assert (select value from settings where key = 'hidden_columns') @> '["ppa.city", "ppa.state", "ppa.country"]'::jsonb;
end $$;
