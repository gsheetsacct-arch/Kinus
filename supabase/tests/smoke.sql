\set ON_ERROR_STOP on
-- Smoke test: statuses, scope, search, buzzer, audit. Run by supabase/tests/run.sh.
-- profiles are created by the auth trigger from user metadata
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-000000000001','dir@x.com','{"full_name":"Director","global_role":"director"}'),
 ('00000000-0000-0000-0000-000000000002','c@x.com','{"full_name":"Counselor","global_role":"staff"}');
insert into sessions (id,name,is_active) values ('10000000-0000-0000-0000-000000000001','Kinus 5787',true);
insert into divisions (id,session_id,name,language) values ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Hebrew','he'),('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','French','fr');
insert into bunks (id,division_id,name) values ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','א'),('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','1');
insert into campers (id,session_id,source_id,first_name,last_name,division_id,bunk_id) values
 ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','1','מנחם','כהן','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001'),
 ('40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','2','Léa','Gérard','20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002');
insert into staff_scopes (user_id,division_id,bunk_id,scope_role,access_level) values ('00000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','counselor','scan');
select camper_code, display_name, name_normalized from campers order by source_id;
-- Luhn check on generated codes
select camper_code, (select (sum(case when (i%2=0) then (case when d*2>9 then d*2-9 else d*2 end) else d end)) % 10 = 0
  from (select i, substr(reverse(camper_code), i, 1)::int d from generate_series(1,6) i) t) as luhn_ok from campers;
-- act as counselor
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select 'counselor sees' as who, count(*) from campers_visible;
select display_name, medical_notes, has_medical_flag from campers_visible;
select display_name, score from search_campers('10000000-0000-0000-0000-000000000001','כהנ');
select display_name, score from search_campers('10000000-0000-0000-0000-000000000001','gerard');
select event_type, resulting_status from record_attendance('40000000-0000-0000-0000-000000000001','arrival','scan');
select event_type, resulting_status from record_attendance('40000000-0000-0000-0000-000000000001','leave','manual','doctor');
select event_type, resulting_status from record_attendance('40000000-0000-0000-0000-000000000001','return','scan');
select buzzer_number from assign_buzzer('40000000-0000-0000-0000-000000000001', 17);
select status from request_page('40000000-0000-0000-0000-000000000001');
select status, current_buzzer_number from campers_visible;
select event_type, resulting_status from record_attendance('40000000-0000-0000-0000-000000000001','pickup','scan');
select status, current_buzzer_number from campers_visible;
select released_at is not null as released from buzzer_assignments;
-- out of scope camper must be refused
-- out of scope camper must be refused
do $$ begin
  perform record_attendance('40000000-0000-0000-0000-000000000002','arrival','scan');
  raise exception 'expected refusal for out-of-scope camper';
exception when insufficient_privilege then null; end $$;
-- director correction and audit trail
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select resulting_status from record_attendance('40000000-0000-0000-0000-000000000001','correction','manual','fixed', now(), 'present');
do $$ begin
  if (select count(*) from audit_log where table_name = 'campers' and action = 'UPDATE') < 4 then
    raise exception 'audit log did not record camper updates';
  end if;
end $$;
