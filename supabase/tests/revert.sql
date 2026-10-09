\set ON_ERROR_STOP on
-- Revert test: two imports, undo the newer, then the older; manual edits survive.
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-000000000001','owner@x.com','{"full_name":"Owner","global_role":"owner"}');
insert into sessions (id,name,is_active) values ('10000000-0000-0000-0000-000000000001','Kinus',true);
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

-- import 1: adds two campers
insert into imports (id, session_id, file_name, file_path, status, options) values
 ('60000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','a.csv','x','previewed','{"divisionsInFile":["Division 2"]}');
insert into import_rows (import_id,row_number,raw,parsed,action) values
 ('60000000-0000-0000-0000-000000000001',2,'{}','{"source_id":"1","first_name":"Léa","last_name":"Gérard","division_name":"Division 2","bunk_name":"Bunk Chof","grade":"4","contacts":[{"role":"mother","slot":1,"name":"Ima","phone":"1","phone_e164":"+17180000001"}],"source_data":{}}','add'),
 ('60000000-0000-0000-0000-000000000001',3,'{}','{"source_id":"2","first_name":"מנחם","last_name":"כהן","division_name":"Division 2","bunk_name":"Bunk Chof","grade":"5","contacts":[],"source_data":{}}','add');
select apply_import('60000000-0000-0000-0000-000000000001');

-- import 2: changes grade + bunk for camper 1, adds camper 3 in a new division
insert into imports (id, session_id, file_name, file_path, status, options) values
 ('60000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','b.csv','x','previewed','{"divisionsInFile":["Division 2","Division 3"]}');
insert into import_rows (import_id,row_number,raw,parsed,matched_camper_id,action,changes) values
 ('60000000-0000-0000-0000-000000000002',2,'{}','{"source_id":"1","first_name":"Léa","last_name":"Gérard","division_name":"Division 2","bunk_name":"Bunk Tes","grade":"6","contacts":[{"role":"mother","slot":1,"name":"Ima","phone":"2","phone_e164":"+17180000002"}],"source_data":{"v":2}}',
   (select id from campers where source_id='1'),'update','[{"field":"grade","old":"4","new":"6"},{"field":"bunk","old":"Bunk Chof","new":"Bunk Tes"}]'),
 ('60000000-0000-0000-0000-000000000002',3,'{}','{"source_id":"3","first_name":"New","last_name":"Kid","division_name":"Division 3","bunk_name":"Bunk Mem","contacts":[],"source_data":{}}',null,'add','[]');
select apply_import('60000000-0000-0000-0000-000000000002');

-- refusing to undo the older one while a newer is applied
do $$ begin
  perform revert_import('60000000-0000-0000-0000-000000000001');
  raise exception 'expected refusal';
exception when raise_exception then
  if sqlerrm not like 'A newer import%' then raise; end if;
end $$;

-- a staff edit after import 2 must survive the undo
update campers set tshirt_size = 'YS' where source_id = '1';

select revert_import('60000000-0000-0000-0000-000000000002');

reset role;
do $$ declare r record; begin
  if exists (select 1 from campers where source_id = '3') then raise exception 'camper added by import 2 still exists'; end if;
  if exists (select 1 from divisions where name = 'Division 3') then raise exception 'division created by import 2 still exists'; end if;
  if exists (select 1 from bunks where name = 'Bunk Tes') then raise exception 'bunk created by import 2 still exists'; end if;
  select c.grade, b.name as bunk, c.tshirt_size, c.source_data into r from campers c left join bunks b on b.id = c.bunk_id where c.source_id = '1';
  if r.grade <> '4' then raise exception 'grade not restored: %', r.grade; end if;
  if r.bunk <> 'Bunk Chof' then raise exception 'bunk not restored: %', r.bunk; end if;
  if r.tshirt_size is distinct from 'YS' then raise exception 'staff edit lost: %', r.tshirt_size; end if;
  if r.source_data <> '{}'::jsonb then raise exception 'source_data not restored: %', r.source_data; end if;
  if (select phone_e164 from camper_contacts k join campers c on c.id = k.camper_id where c.source_id = '1') <> '+17180000001' then raise exception 'contact not restored'; end if;
  if (select status::text from imports where id = '60000000-0000-0000-0000-000000000002') <> 'reverted' then raise exception 'status not reverted'; end if;
end $$;

-- now the older import is the latest applied one and can be undone too
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select revert_import('60000000-0000-0000-0000-000000000001');
reset role;
do $$ begin
  if (select count(*) from campers) <> 0 then raise exception 'campers remain after undoing both imports'; end if;
  if (select count(*) from divisions) <> 0 then raise exception 'divisions remain after undoing both imports'; end if;
  if (select count(*) from camper_contacts) <> 0 then raise exception 'contacts remain'; end if;
end $$;

-- deleting a session removes everything that belongs to it
insert into campers (session_id, first_name, last_name) values ('10000000-0000-0000-0000-000000000001','A','B');
delete from sessions where id = '10000000-0000-0000-0000-000000000001';
do $$ begin
  if (select count(*) from campers) + (select count(*) from imports) + (select count(*) from import_rows) <> 0 then
    raise exception 'session delete left rows behind';
  end if;
end $$;
