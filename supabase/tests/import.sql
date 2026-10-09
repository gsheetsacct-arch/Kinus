\set ON_ERROR_STOP on
-- Import test: profile trigger, apply_import adds/updates/missing, attribution. Run by supabase/tests/run.sh.
insert into settings (key, value) values ('bootstrap_owner', '{"email":"owner@x.com"}');
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-000000000001','owner@x.com','{}'),
  ('00000000-0000-0000-0000-000000000002','hc@x.com','{"full_name":"Head C","role":"counselor"}');
select id, full_name, role from profiles order by email;
insert into sessions (id,name,is_active) values ('10000000-0000-0000-0000-000000000001','Kinus',true);
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
-- first import: two adds
insert into imports (id, session_id, file_name, file_path, status, options) values
 ('60000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','a.csv','imports/a.csv','previewed','{"divisionsInFile":["Hebrew Division","Division 2"]}');
insert into import_rows (import_id,row_number,raw,parsed,action) values
 ('60000000-0000-0000-0000-000000000001',1,'{}','{"source_id":"2509","first_name":"אלישע","last_name":"פיש","division_name":"Hebrew Division","bunk_name":"Group 112","tshirt_size":"Youth Small","has_epipen":false,"bunk_preferences":["a","b"],"contacts":[{"role":"mother","slot":1,"name":"Ima","phone":"+1 718 222 2222","phone_e164":"+17182222222"},{"role":"emergency","slot":2,"name":"","phone":""}],"source_data":{"x":1}}','add'),
 ('60000000-0000-0000-0000-000000000001',2,'{}','{"source_id":"2162","first_name":"Camper","last_name":"Test","division_name":"Division 2","bunk_name":"Bunk Chof","contacts":[],"source_data":{}}','add');
select apply_import('60000000-0000-0000-0000-000000000001');
select c.camper_code, c.display_name, d.name as division, d.language, b.name as bunk, c.tshirt_size, c.bunk_preferences, c.in_latest_import from campers c join divisions d on d.id=c.division_id left join bunks b on b.id=c.bunk_id order by c.source_id;
select role, slot, name, phone_e164 from camper_contacts order by role;
-- second import: update bunk + contact, camper 2162 missing from Division 2
insert into imports (id, session_id, file_name, file_path, status, options) values
 ('60000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','b.csv','imports/b.csv','previewed','{"divisionsInFile":["Hebrew Division","Division 2"]}');
insert into import_rows (import_id,row_number,raw,parsed,matched_camper_id,action,changes) values
 ('60000000-0000-0000-0000-000000000002',1,'{}','{"source_id":"2509","first_name":"אלישע","last_name":"פיש","division_name":"Hebrew Division","bunk_name":"Group 113","tshirt_size":"Youth Small","contacts":[{"role":"mother","slot":1,"name":"Ima","phone":"+1 718 333 3333","phone_e164":"+17183333333"}],"source_data":{"x":2}}',
  (select id from campers where source_id='2509'),'update','[{"field":"bunk","old":"Group 112","new":"Group 113"},{"field":"contact[mother].phone","old":"+17182222222","new":"+17183333333"}]');
select apply_import('60000000-0000-0000-0000-000000000002');
select c.display_name, b.name as bunk, c.in_latest_import from campers c left join bunks b on b.id=c.bunk_id order by c.source_id;
select role, phone_e164 from camper_contacts;
select source, action, diff->'bunk_id' is not null as bunk_changed from audit_log where table_name='campers' and action='UPDATE' order by id;
select status, summary from imports order by uploaded_at;
-- a non-admin must be refused
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$ begin
  perform apply_import('60000000-0000-0000-0000-000000000002');
  raise exception 'expected refusal for non-admin';
exception when insufficient_privilege then null; end $$;
-- assertions on the end state (as superuser, outside RLS)
reset role;
do $$ begin
  if (select in_latest_import from campers where source_id = '2509') is not true then raise exception '2509 should be in latest import'; end if;
  if (select in_latest_import from campers where source_id = '2162') is not false then raise exception '2162 should be flagged missing'; end if;
  if (select b.name from campers c join bunks b on b.id = c.bunk_id where c.source_id = '2509') <> 'Group 113' then raise exception 'bunk not updated'; end if;
  if (select phone_e164 from camper_contacts k join campers c on c.id = k.camper_id where c.source_id = '2509' and k.role = 'mother') <> '+17183333333' then raise exception 'contact not updated'; end if;
  if (select count(*) from audit_log where source like 'import:%') < 2 then raise exception 'import not attributed in audit log'; end if;
end $$;
