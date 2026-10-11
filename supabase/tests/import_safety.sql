\set ON_ERROR_STOP on
-- Import safety (0015): staff edits are remembered, undo keeps checked-in campers,
-- archiving "missing" campers is undone with the import, walk-ins aren't "missing".
insert into auth.users (id, email, raw_app_meta_data) values
 ('00000000-0000-0000-0000-000000000001','owner@x.com','{"full_name":"Owner","role":"owner","all_areas":true}');
insert into sessions (id,name,is_active) values ('10000000-0000-0000-0000-000000000001','Kinus',true);
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

-- import 1: two campers
insert into imports (id, session_id, file_name, file_path, status, options) values
 ('60000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','a.csv','x','previewed','{"divisionsInFile":["Division 2"]}');
insert into import_rows (import_id,row_number,raw,parsed,action) values
 ('60000000-0000-0000-0000-000000000001',2,'{}','{"source_id":"1","first_name":"Sarah","last_name":"Gurary","division_name":"Division 2","bunk_name":"Bunk Chof","has_allergies":false,"contacts":[],"source_data":{}}','add'),
 ('60000000-0000-0000-0000-000000000001',3,'{}','{"source_id":"2","first_name":"Gone","last_name":"Kid","division_name":"Division 2","bunk_name":"Bunk Chof","contacts":[],"source_data":{}}','add');
select apply_import('60000000-0000-0000-0000-000000000001');

-- the nurse marks allergies by hand; the import itself never counts as a staff edit
update campers set has_allergies = true, allergies = 'Peanuts' where source_id = '1';
reset role;
do $$ begin
  if (select staff_edited from campers where source_id = '1') <> array['allergies','has_allergies'] and (select staff_edited from campers where source_id = '1') <> array['has_allergies','allergies'] then
    raise exception 'staff edits not remembered: %', (select staff_edited from campers where source_id = '1');
  end if;
  if (select staff_edited from campers where source_id = '2') <> '{}' then raise exception 'import counted as a staff edit'; end if;
end $$;

-- a walk-in added at the gate (no registration id), checked in
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
insert into campers (session_id, first_name, last_name, division_id, in_latest_import)
  select '10000000-0000-0000-0000-000000000001', 'Walk', 'In', id, false from divisions where name = 'Division 2';

-- import 2: camper 2 left the export; adds a late registration who then checks in
insert into imports (id, session_id, file_name, file_path, status, options) values
 ('60000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','b.csv','x','previewed','{"divisionsInFile":["Division 2"]}');
insert into import_rows (import_id,row_number,raw,parsed,matched_camper_id,action,changes) values
 ('60000000-0000-0000-0000-000000000002',2,'{}','{"source_id":"1","first_name":"Sarah","last_name":"Gurary","division_name":"Division 2","bunk_name":"Bunk Chof","contacts":[],"source_data":{}}',(select id from campers where source_id='1'),'unchanged','[]'),
 ('60000000-0000-0000-0000-000000000002',3,'{}','{"source_id":"3","first_name":"Late","last_name":"Kid","division_name":"Division 2","bunk_name":"Bunk Chof","contacts":[],"source_data":{}}',null,'add','[]');
select apply_import('60000000-0000-0000-0000-000000000002');
reset role;
do $$ begin
  if (select in_latest_import from campers where source_id = '2') then raise exception 'camper 2 should be missing from the export'; end if;
  if (select summary->>'markedMissing' from imports where id = '60000000-0000-0000-0000-000000000002') <> '1' then raise exception 'walk-in counted as missing: %', (select summary from imports where id = '60000000-0000-0000-0000-000000000002'); end if;
end $$;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select record_attendance((select id from campers where source_id = '3'), 'arrival', 'scan');
select archive_missing('60000000-0000-0000-0000-000000000002', array[(select id from campers where source_id = '2')]);

-- undo import 2: the late kid who checked in stays (not archived); camper 2 comes back
select revert_import('60000000-0000-0000-0000-000000000002');
reset role;
do $$ begin
  if (select archived_at from campers where source_id = '3') is not null then raise exception 'checked-in camper was archived by undo'; end if;
  if (select in_latest_import from campers where source_id = '3') then raise exception 'kept camper should be marked not in the latest export'; end if;
  if (select archived_at from campers where source_id = '2') is not null then raise exception 'camper archived from the missing list did not come back'; end if;
end $$;

-- applying the same file again matches the kept camper instead of failing on the duplicate id
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
insert into imports (id, session_id, file_name, file_path, status, options) values
 ('60000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','b.csv','x','previewed','{"divisionsInFile":["Division 2"]}');
insert into import_rows (import_id,row_number,raw,parsed,matched_camper_id,action,changes) values
 ('60000000-0000-0000-0000-000000000003',3,'{}','{"source_id":"3","first_name":"Late","last_name":"Kid","division_name":"Division 2","bunk_name":"Bunk Chof","contacts":[],"source_data":{}}',(select id from campers where source_id='3'),'unchanged','[]');
select apply_import('60000000-0000-0000-0000-000000000003');
reset role;
do $$ begin
  if not (select in_latest_import from campers where source_id = '3') then raise exception 're-applied camper not back in the export'; end if;
  if (select status::text from campers where source_id = '3') <> 'present' then raise exception 'check-in lost'; end if;
end $$;
