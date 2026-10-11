\set ON_ERROR_STOP on
-- Security (audit findings): what a signed-out caller and a counselor can't do through the API.
insert into sessions (id, name, is_active) values ('10000000-0000-0000-0000-000000000001', 'S', true);
insert into divisions (id, session_id, name) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Division 1');
insert into bunks (id, division_id, name) values ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Alef');
insert into campers (id, session_id, first_name, last_name, division_id, bunk_id, medical_notes, local_address, staff_notes, has_allergies, source_data) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'A', 'Mine', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'PEANUTS', '77 Secret Ave', 'night light', true, '{"ppa.medical_considerations":"asthma"}');
insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-0000-0000-000000000001', 'owner@x.com', '{"full_name":"Owner","role":"owner"}'),
  ('00000000-0000-0000-0000-000000000003', 'c@x.com', '{"full_name":"Counselor","role":"counselor"}');
insert into staff_scopes (user_id, division_id, bunk_id) values ('00000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001');
update field_visibility set roles = '{owner,director}';
-- a change to medical details in the history
update campers set medical_notes = 'PEANUTS AND SESAME', grade = '5' where id = '40000000-0000-0000-0000-000000000001';

-- someone signing up with "role: owner" in their own details gets nothing
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-000000000009', 'stranger@x.com', '{"full_name":"Stranger","role":"owner","all_areas":true,"access_level":"edit"}');
do $$ begin
  if (select role::text || '/' || all_areas::text || '/' || access_level::text from profiles where email = 'stranger@x.com') <> 'counselor/false/view' then
    raise exception 'sign-up metadata was trusted: %', (select role::text || '/' || all_areas::text || '/' || access_level::text from profiles where email = 'stranger@x.com');
  end if;
end $$;

-- signed out: no functions, no tables
set role anon;
do $$ begin
  perform restore_fields('profiles', '00000000-0000-0000-0000-000000000003', '{"role":{"old":"owner","new":"counselor"}}');
  raise exception 'anon ran restore_fields';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform ensure_division('10000000-0000-0000-0000-000000000001', 'Anon Division');
  raise exception 'anon created a division';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform count(*) from campers_visible;
  raise exception 'anon read campers';
exception when insufficient_privilege then null; end $$;

-- counselor
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
do $$ begin
  perform restore_fields('profiles', '00000000-0000-0000-0000-000000000003', '{"role":{"old":"owner","new":"counselor"}}');
  raise exception 'counselor ran restore_fields';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform ensure_bunk('20000000-0000-0000-0000-000000000001', 'Sneaky');
  raise exception 'counselor created a bunk';
exception when insufficient_privilege then null; end $$;
-- sensitive columns aren't readable from the table, only masked through the view
do $$ begin
  perform medical_notes from campers;
  raise exception 'counselor read medical_notes from the table';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform source_data from campers;
  raise exception 'counselor read the raw export row';
exception when insufficient_privilege then null; end $$;
do $$ begin
  if (select count(*) from campers) <> 1 then raise exception 'counselor lost their own camper'; end if;
  if (select medical_notes is null and local_address is null and staff_notes is null and has_medical_flag from campers_visible) is not true then
    raise exception 'view does not mask';
  end if;
end $$;
-- history doesn't show hidden details
do $$ begin
  if exists (select 1 from camper_history('40000000-0000-0000-0000-000000000001') h where h.diff ? 'medical_notes' or h.diff ? 'source_data') then
    raise exception 'history shows medical changes to a counselor';
  end if;
  if not exists (select 1 from camper_history('40000000-0000-0000-0000-000000000001') h where h.diff ? 'grade') then
    raise exception 'history lost ordinary changes';
  end if;
end $$;
-- other staff's emails and phones
do $$ begin
  perform email from profiles;
  raise exception 'counselor read staff emails';
exception when insufficient_privilege then null; end $$;
do $$ begin
  if (select count(*) from profiles where full_name = 'Owner') <> 1 then raise exception 'names should stay readable'; end if;
end $$;
-- undo after losing access
select set_config('test.ev', (record_attendance('40000000-0000-0000-0000-000000000001', 'arrival', 'scan')).id::text, false);
reset role;
delete from staff_scopes where user_id = '00000000-0000-0000-0000-000000000003';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
do $$ begin
  perform undo_attendance(current_setting('test.ev')::uuid);
  raise exception 'undo without access';
exception when insufficient_privilege then null; end $$;

-- the owner still sees everything through the view
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$ begin
  if (select medical_notes from campers_visible) <> 'PEANUTS AND SESAME' then raise exception 'owner lost medical details'; end if;
  if not exists (select 1 from camper_history('40000000-0000-0000-0000-000000000001') h where h.diff ? 'medical_notes') then raise exception 'owner lost history'; end if;
end $$;
