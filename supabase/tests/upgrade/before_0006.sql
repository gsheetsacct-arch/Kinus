-- Staff as they were before 0006: global roles and per-division scope roles,
-- including the same division given twice (allowed by the old unique key).
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'owner@x.test'),
  ('a0000000-0000-0000-0000-000000000002', 'head@x.test'),
  ('a0000000-0000-0000-0000-000000000003', 'admin@x.test'),
  ('a0000000-0000-0000-0000-000000000004', 'nobody@x.test');
insert into profiles (id, email, full_name, global_role) values
  ('a0000000-0000-0000-0000-000000000001', 'owner@x.test', 'Owner', 'owner'),
  ('a0000000-0000-0000-0000-000000000002', 'head@x.test', 'Head', 'staff'),
  ('a0000000-0000-0000-0000-000000000003', 'admin@x.test', 'Admin', 'admin'),
  ('a0000000-0000-0000-0000-000000000004', 'nobody@x.test', 'Nobody', 'staff')
on conflict (id) do update set global_role = excluded.global_role;
insert into sessions (id, name, is_active) values ('a1000000-0000-0000-0000-000000000001', 'Upgrade', true);
insert into divisions (id, session_id, name) values ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Division 1');
insert into bunks (id, division_id, name) values ('a3000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'Bunk 1');
insert into staff_scopes (user_id, division_id, bunk_id, scope_role, access_level) values
  ('a0000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000001', null, 'head_counselor', 'scan'),
  ('a0000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000001', null, 'division_head', 'edit'),
  ('a0000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'counselor', 'view');
