\set ON_ERROR_STOP on
-- Attendance test: undo window and ownership, bulk actions, board view.
insert into auth.users (id, email, raw_app_meta_data) values
 ('00000000-0000-0000-0000-000000000001','dir@x.com','{"full_name":"Director","role":"director","all_areas":true}'),
 ('00000000-0000-0000-0000-000000000002','c@x.com','{"full_name":"Counselor","role":"logistics","all_areas":true}');
insert into sessions (id,name,is_active) values ('10000000-0000-0000-0000-000000000001','S',true);
insert into campers (id, session_id, first_name, last_name) values
 ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','A','One'),
 ('40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','B','Two'),
 ('40000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','C','Three');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';

-- check in, undo → back to expected
create temp table t as select * from record_attendance('40000000-0000-0000-0000-000000000001','arrival','scan');
select undo_attendance((select id from t));
do $$ begin
  if (select status from campers where id = '40000000-0000-0000-0000-000000000001') <> 'expected' then raise exception 'undo did not restore expected'; end if;
end $$;
-- undo twice is refused
do $$ begin
  perform undo_attendance((select id from t));
  raise exception 'expected refusal';
exception when raise_exception then if sqlerrm not like '%already undone%' and sqlerrm not like '%Something else%' then raise; end if; end $$;

-- leave → undo returns to present, not expected
select record_attendance('40000000-0000-0000-0000-000000000002','arrival','scan');
truncate t; insert into t select * from record_attendance('40000000-0000-0000-0000-000000000002','leave','scan');
select undo_attendance((select id from t));
do $$ begin
  if (select status from campers where id = '40000000-0000-0000-0000-000000000002') <> 'present' then raise exception 'undo of leave did not return to present'; end if;
end $$;

-- someone else cannot undo it; and it expires
truncate t; insert into t select * from record_attendance('40000000-0000-0000-0000-000000000002','leave','scan');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$ begin
  perform undo_attendance((select id from t));
  raise exception 'expected refusal';
exception when insufficient_privilege then null; end $$;
reset role;
update attendance_events set created_at = now() - interval '2 minutes' where id = (select id from t);
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$ begin
  perform undo_attendance((select id from t));
  raise exception 'expected refusal';
exception when raise_exception then if sqlerrm not like 'Too late%' then raise; end if; end $$;

-- bulk: logistics may not; director marks the remaining expected campers no-show
do $$ begin
  perform bulk_attendance(array['40000000-0000-0000-0000-000000000001']::uuid[], 'no_show');
  raise exception 'expected refusal';
exception when insufficient_privilege then null; end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$ declare r jsonb; begin
  r := bulk_attendance(array['40000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000003']::uuid[], 'no_show');
  if (r->>'done')::int <> 2 or (r->>'skipped')::int <> 1 then raise exception 'bulk result %', r; end if;
end $$;

-- board view shows who did the last event
do $$ begin
  if (select last_event_by from campers_board where id = '40000000-0000-0000-0000-000000000003') <> 'Director' then raise exception 'board missing last_event_by'; end if;
  if (select last_event_type::text from campers_board where id = '40000000-0000-0000-0000-000000000002') <> 'leave' then raise exception 'board last_event_type wrong'; end if;
end $$;

-- seeds present
reset role;
do $$ begin
  if (select count(*) from merge_fields) < 16 then raise exception 'merge fields not seeded'; end if;
  if (select count(*) from print_templates) < 2 then raise exception 'templates not seeded'; end if;
end $$;
