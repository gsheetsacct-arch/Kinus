\set ON_ERROR_STOP on
-- Areas test: a director over a group sees only that group's divisions; bunk and
-- division areas; owner sees all; admin-only setup; field visibility by role.
insert into sessions (id,name,is_active) values ('10000000-0000-0000-0000-000000000001','S',true);
insert into division_groups (id, session_id, name) values ('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Main camp');
insert into divisions (id, session_id, name, group_id) values
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Division 1','50000000-0000-0000-0000-000000000001'),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Bar Mitzvah Program','50000000-0000-0000-0000-000000000001'),
 ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','French Division',null);
insert into bunks (id, division_id, name) values ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Bunk Alef'),('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','Bunk Beis');
insert into campers (id, session_id, first_name, last_name, division_id, bunk_id) values
 ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','A','Main1','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001'),
 ('40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','B','BMP','20000000-0000-0000-0000-000000000002',null),
 ('40000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','C','French','20000000-0000-0000-0000-000000000003',null),
 ('40000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','D','Main2','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002');
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-000000000001','owner@x.com','{"full_name":"Owner","role":"owner"}'),
 ('00000000-0000-0000-0000-000000000002','dir@x.com','{"full_name":"Main director","role":"director"}'),
 ('00000000-0000-0000-0000-000000000003','c@x.com','{"full_name":"Counselor","role":"counselor"}'),
 ('00000000-0000-0000-0000-000000000004','dh@x.com','{"full_name":"French head","role":"division_head"}');
insert into staff_scopes (user_id, group_id) values ('00000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001');
insert into staff_scopes (user_id, division_id, bunk_id) values ('00000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001');
insert into staff_scopes (user_id, division_id) values ('00000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000003');
do $$ begin
  if (select role::text || '/' || access_level::text || '/' || all_areas::text from profiles where email = 'dir@x.com') <> 'director/edit/false' then raise exception 'director defaults wrong'; end if;
  if (select access_level::text from profiles where email = 'c@x.com') <> 'scan' then raise exception 'counselor default level wrong'; end if;
end $$;
set role authenticated;
-- director over Main camp: Division 1 + Bar Mitzvah, not French; can correct, can't do setup
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$ begin
  if (select string_agg(last_name, ',' order by last_name) from campers) <> 'BMP,Main1,Main2' then raise exception 'group director sees %', (select string_agg(last_name, ',' order by last_name) from campers); end if;
  if is_admin() then raise exception 'area director must not be admin'; end if;
end $$;
select record_attendance('40000000-0000-0000-0000-000000000002','arrival','scan');
select record_attendance('40000000-0000-0000-0000-000000000002','correction','manual','fix', now(), 'expected');
do $$ begin
  perform record_attendance('40000000-0000-0000-0000-000000000003','arrival','scan');
  raise exception 'expected refusal for French camper';
exception when insufficient_privilege then null; end $$;
do $$ begin
  insert into sessions (name) values ('nope');
  raise exception 'area director created a session';
exception when insufficient_privilege then null; end $$;
-- counselor: only their bunk
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
do $$ begin
  if (select string_agg(last_name, ',') from campers) <> 'Main1' then raise exception 'counselor sees %', (select string_agg(last_name, ',') from campers); end if;
  if (select medical_notes is null and has_medical_flag is not null from campers_visible limit 1) is not true then raise exception 'counselor medical masking wrong'; end if;
end $$;
-- division head of French: only French; can't change own role
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
do $$ begin
  if (select string_agg(last_name, ',') from campers) <> 'French' then raise exception 'division head sees %', (select string_agg(last_name, ',') from campers); end if;
  update profiles set role = 'owner' where id = '00000000-0000-0000-0000-000000000004';
  raise exception 'self-promotion allowed';
exception when insufficient_privilege then null; end $$;
-- owner sees everything and is admin
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$ begin
  if (select count(*) from campers) <> 4 then raise exception 'owner sees %', (select count(*) from campers); end if;
  if not is_admin() then raise exception 'owner not admin'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- contacts, check-ins, editing and deactivated accounts (policies from 0008)
-- ---------------------------------------------------------------------------
reset role;
insert into camper_contacts (camper_id, role, slot, name, phone) values
 ('40000000-0000-0000-0000-000000000001','mother',1,'Mom of Main1','7185550001'),
 ('40000000-0000-0000-0000-000000000003','mother',1,'Mom of French','7185550003');
update field_visibility set roles = '{owner,director,counselor}' where field_group = 'contacts';
update field_visibility set roles = '{owner,director}' where field_group = 'medical';
update campers set medical_notes = 'peanuts', has_allergies = true;
set role authenticated;
-- counselor: contacts of their own bunk only; no medical details; can't edit at scan level
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
do $$ declare n int; begin
  if (select string_agg(name, ',') from camper_contacts) <> 'Mom of Main1' then raise exception 'counselor contacts: %', (select string_agg(name, ',') from camper_contacts); end if;
  if (select count(*) from campers_visible where medical_notes is not null) <> 0 then raise exception 'counselor saw medical notes'; end if;
  if (select count(*) from campers_visible where has_medical_flag) <> 1 then raise exception 'counselor lost the medical flag'; end if;
  update campers set staff_notes = 'x' where id = '40000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'scan-level counselor edited a camper'; end if;
end $$;
-- French division head (edit): sees no contacts (role not allowed), may edit French only
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
do $$ declare n int; begin
  if (select count(*) from camper_contacts) <> 0 then raise exception 'division head saw contacts without permission'; end if;
  update campers set staff_notes = 'ok' where id in ('40000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000001');
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'division head edited % campers', n; end if;
end $$;
-- group director: sees the check-in recorded earlier, and medical details
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$ begin
  if (select count(*) from attendance_events) <> 2 then raise exception 'director sees % events', (select count(*) from attendance_events); end if;
  if (select count(*) from campers_visible where medical_notes = 'peanuts') <> 3 then raise exception 'director medical: %', (select count(*) from campers_visible where medical_notes = 'peanuts'); end if;
end $$;
-- counselor can't see events of campers outside their bunk
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
do $$ begin
  if (select count(*) from attendance_events) <> 0 then raise exception 'counselor sees others'' events'; end if;
end $$;
-- deactivated: nothing at all, even with areas
reset role;
update profiles set is_active = false where id = '00000000-0000-0000-0000-000000000003';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
do $$ begin
  if (select count(*) from campers) <> 0 or (select count(*) from camper_contacts) <> 0 then raise exception 'deactivated user still sees campers'; end if;
end $$;
