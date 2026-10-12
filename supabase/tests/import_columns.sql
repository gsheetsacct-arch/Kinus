\set ON_ERROR_STOP on
-- 0020: a column added to the export reaches campers whose other details didn't change,
-- and undoing that import takes it away again.
insert into auth.users (id, email, raw_app_meta_data) values
 ('00000000-0000-0000-0000-000000000001','owner@x.com','{"full_name":"Owner","role":"owner","all_areas":true}');
insert into sessions (id,name,is_active) values ('10000000-0000-0000-0000-000000000001','Kinus',true);
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

insert into imports (id, session_id, file_name, file_path, status, options) values
 ('70000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','a.csv','x','previewed','{"divisionsInFile":["Division 2"]}');
insert into import_rows (import_id,row_number,raw,parsed,action) values
 ('70000000-0000-0000-0000-000000000001',2,'{}','{"source_id":"1","first_name":"Yossi","last_name":"Friedman","division_name":"Division 2","bunk_name":"Bunk Yud","contacts":[],"source_data":{"students.id":"1"}}','add');
select apply_import('70000000-0000-0000-0000-000000000001');

-- the next export has a new column; nothing Kinus tracks changed, so the row is "unchanged"
insert into imports (id, session_id, file_name, file_path, status, options) values
 ('70000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','b.csv','x','previewed','{"divisionsInFile":["Division 2"]}');
insert into import_rows (import_id,row_number,raw,parsed,matched_camper_id,action,changes) values
 ('70000000-0000-0000-0000-000000000002',2,'{}','{"source_id":"1","first_name":"Yossi","last_name":"Friedman","division_name":"Division 2","bunk_name":"Bunk Yud","contacts":[],"source_data":{"students.id":"1","ppa.yarmulka_size":"7"}}',(select id from campers where source_id='1'),'unchanged','[]');
select apply_import('70000000-0000-0000-0000-000000000002');
reset role;
do $$ begin
  if (select source_data->>'ppa.yarmulka_size' from campers where source_id = '1') is distinct from '7' then
    raise exception 'new export column not stored: %', (select source_data from campers where source_id = '1');
  end if;
end $$;

set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select revert_import('70000000-0000-0000-0000-000000000002');
reset role;
do $$ begin
  if (select source_data ? 'ppa.yarmulka_size' from campers where source_id = '1') then
    raise exception 'undo kept the new column: %', (select source_data from campers where source_id = '1');
  end if;
end $$;
