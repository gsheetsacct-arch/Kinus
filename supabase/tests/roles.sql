\set ON_ERROR_STOP on
-- 0021: the role decides the level; deleting a person keeps what they recorded.
insert into auth.users (id, email, raw_app_meta_data) values
 ('00000000-0000-0000-0000-000000000001','owner@x.com','{"full_name":"Owner","role":"owner","all_areas":true}'),
 ('00000000-0000-0000-0000-000000000002','c@x.com','{"full_name":"Counselor"}');
insert into sessions (id,name,is_active) values ('10000000-0000-0000-0000-000000000001','Kinus',true);
update profiles set role = 'counselor', access_level = 'edit' where id = '00000000-0000-0000-0000-000000000002';
do $$ begin
  if (select access_level from profiles where id = '00000000-0000-0000-0000-000000000002') <> 'scan' then raise exception 'a person got their own level'; end if;
end $$;

-- the role changes: everyone in it follows
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
update role_access set access_level = 'view' where role = 'counselor';
reset role;
do $$ begin
  if (select access_level from profiles where id = '00000000-0000-0000-0000-000000000002') <> 'view' then raise exception 'role level not applied'; end if;
  if (select access_level from profiles where id = '00000000-0000-0000-0000-000000000001') <> 'edit' then raise exception 'owner lost edit'; end if;
end $$;

-- a counselor can't change role levels
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
update role_access set access_level = 'edit' where role = 'counselor';
reset role;
do $$ begin
  if (select access_level from role_access where role = 'counselor') <> 'view' then raise exception 'counselor changed role levels'; end if;
end $$;

-- delete someone who recorded a check-in: the check-in stays, without them
insert into divisions (id, session_id, name) values ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Division 1');
insert into campers (id, session_id, first_name, last_name, division_id) values ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Yossi','Friedman','20000000-0000-0000-0000-000000000001');
insert into attendance_events (camper_id, event_type, recorded_by, resulting_status) values ('40000000-0000-0000-0000-000000000001','arrival','00000000-0000-0000-0000-000000000002','present');
delete from auth.users where id = '00000000-0000-0000-0000-000000000002';
do $$ begin
  if exists (select 1 from profiles where id = '00000000-0000-0000-0000-000000000002') then raise exception 'profile not deleted'; end if;
  if (select count(*) from attendance_events where camper_id = '40000000-0000-0000-0000-000000000001' and recorded_by is null) <> 1 then raise exception 'check-in lost'; end if;
end $$;
