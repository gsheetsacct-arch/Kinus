\set ON_ERROR_STOP on
-- Missing campers: follow-ups and "not coming" for whoever checks a bunk in.
insert into sessions (id, name, is_active) values ('10000000-0000-0000-0000-000000000001', 'S', true);
insert into divisions (id, session_id, name) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Division 1');
insert into bunks (id, division_id, name) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Alef'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'Beis');
insert into campers (id, session_id, first_name, last_name, division_id, bunk_id) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'A', 'Mine', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'B', 'Other', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002');
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-000000000003', 'c@x.com', '{"full_name":"Counselor","role":"counselor"}');
insert into staff_scopes (user_id, division_id, bunk_id) values ('00000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001');
do $$ begin
  if (select value->>'percent' from settings where key = 'missing_rules') <> '75' then raise exception 'default rule missing'; end if;
end $$;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
-- coming later / notes on their own camper only
insert into camper_followups (camper_id, until, note) values ('40000000-0000-0000-0000-000000000001', now() + interval '2 hours', 'Mom says after lunch');
do $$ begin
  insert into camper_followups (camper_id, note) values ('40000000-0000-0000-0000-000000000002', 'not mine');
  raise exception 'wrote a follow-up for another bunk';
exception when insufficient_privilege then null; end $$;
do $$ begin
  if (select updated_by from camper_followups) <> '00000000-0000-0000-0000-000000000003' then raise exception 'author not recorded'; end if;
  if (select count(*) from camper_followups) <> 1 then raise exception 'sees others'' follow-ups'; end if;
end $$;
-- not coming, then taken back
select record_attendance('40000000-0000-0000-0000-000000000001', 'no_show', 'manual', 'Sick this week');
select record_attendance('40000000-0000-0000-0000-000000000001', 'correction', 'manual', 'Not coming taken back', now(), 'expected');
do $$ begin
  if (select status from campers where id = '40000000-0000-0000-0000-000000000001') <> 'expected' then raise exception 'not back to expected'; end if;
end $$;
-- other corrections stay with directors
do $$ begin
  perform record_attendance('40000000-0000-0000-0000-000000000001', 'correction', 'manual', 'sneaky', now(), 'present');
  raise exception 'counselor made a correction';
exception when insufficient_privilege then null; end $$;
