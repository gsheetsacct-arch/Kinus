\set ON_ERROR_STOP on
-- Final check-out: a check-in login with final check-out records "gone home" for every
-- division of its camp (and undoes it), nothing else; without it, only its own division.
insert into sessions (id,name,is_active) values ('10000000-0000-0000-0000-000000000001','S',true);
insert into division_groups (id, session_id, name) values
 ('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','American'),
 ('50000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Hebrew');
insert into divisions (id, session_id, name, group_id) values
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Division 1','50000000-0000-0000-0000-000000000001'),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Division 2','50000000-0000-0000-0000-000000000001'),
 ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','Hebrew Division','50000000-0000-0000-0000-000000000002');
insert into campers (id, session_id, first_name, last_name, division_id) values
 ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','A','Div1','20000000-0000-0000-0000-000000000001'),
 ('40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','B','Div2','20000000-0000-0000-0000-000000000002'),
 ('40000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','C','Heb','20000000-0000-0000-0000-000000000003'),
 ('40000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','D','Div2b','20000000-0000-0000-0000-000000000002');
-- everyone arrived at the start of camp
insert into attendance_events (camper_id, event_type, method, occurred_at, resulting_status, created_at)
select id, 'arrival', 'scan', now() - interval '5 days', 'present', now() - interval '5 days' from campers;
update campers set status = 'present';
insert into auth.users (id, email, raw_app_meta_data) values
 ('00000000-0000-0000-0000-000000000001','checkin.div-1@x.com','{"full_name":"Div 1 checkout","role":"scanner"}'),
 ('00000000-0000-0000-0000-000000000002','checkin.div-1-2@x.com','{"full_name":"Div 1 gate","role":"scanner"}');
insert into staff_scopes (user_id, division_id) values
 ('00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001');
update profiles set login = 'shared';
update profiles set final_checkout = true where id = '00000000-0000-0000-0000-000000000001';

set role authenticated;
-- with final check-out: still sees only its own division in lists
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$ begin
  if (select string_agg(last_name, ',') from campers) <> 'Div1' then raise exception 'final check-out login sees %', (select string_agg(last_name, ',') from campers); end if;
  if array_length(my_checkout_divisions(), 1) <> 2 then raise exception 'checkout divisions %', my_checkout_divisions(); end if;
end $$;
-- gone home: a camper of another division of the same camp
select (record_attendance('40000000-0000-0000-0000-000000000002','pickup','scan')).id as ev \gset
-- and undo it
select undo_attendance(:'ev');
-- but nothing else for that division
do $$ begin
  perform record_attendance('40000000-0000-0000-0000-000000000002','leave','scan');
  raise exception 'final check-out login recorded a leave in another division';
exception when insufficient_privilege then null; end $$;
-- and nothing in another camp
do $$ begin
  perform record_attendance('40000000-0000-0000-0000-000000000003','pickup','scan');
  raise exception 'final check-out login reached another camp';
exception when insufficient_privilege then null; end $$;
-- its own division as before
select record_attendance('40000000-0000-0000-0000-000000000001','leave','scan');

-- without final check-out: only its own division, and it can't switch it on itself
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$ begin
  if array_length(my_checkout_divisions(), 1) is not null then raise exception 'plain login has checkout divisions'; end if;
  perform record_attendance('40000000-0000-0000-0000-000000000004','pickup','scan');
  raise exception 'plain login checked out another division';
exception when insufficient_privilege then null; end $$;
do $$ begin
  update profiles set final_checkout = true where id = '00000000-0000-0000-0000-000000000002';
  raise exception 'gave itself final check-out';
exception when insufficient_privilege then null; end $$;

reset role;
do $$ begin
  if (select status::text from campers where id = '40000000-0000-0000-0000-000000000002') <> 'present' then raise exception 'undo did not restore'; end if;
  if (select status::text from campers where id = '40000000-0000-0000-0000-000000000001') <> 'out' then raise exception 'own division leave missing'; end if;
  if (select status::text from campers where id = '40000000-0000-0000-0000-000000000004') <> 'present' then raise exception 'plain login changed another division'; end if;
end $$;
