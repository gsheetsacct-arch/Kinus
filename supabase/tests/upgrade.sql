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
