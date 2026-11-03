\set ON_ERROR_STOP on
-- 0054: two records of one person become one
insert into auth.users (id, email, raw_app_meta_data) values
 ('00000000-0000-0000-0000-000000000001','sarah@x.com','{"full_name":"Sarah Cohen"}'),
 ('00000000-0000-0000-0000-000000000002','no-email.abc@x.com','{"full_name":"Sarah Cohen"}');
insert into sessions (id,name,is_active) values ('10000000-0000-0000-0000-000000000001','Kinus',true);
insert into divisions (id, session_id, name) values ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Division 1');
update profiles set phone = '+15551110000', source_id = 'S-77', details = '{"Shirt":"M","Group":"A"}', title = 'Counselor' where id = '00000000-0000-0000-0000-000000000002';
update profiles set details = '{"Group":"B"}' where id = '00000000-0000-0000-0000-000000000001';
insert into staff_scopes (user_id, division_id) values ('00000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001');
insert into print_jobs (session_id, kind, deliver_to, requested_by, status, item_count) values ('10000000-0000-0000-0000-000000000001','name_tag','','00000000-0000-0000-0000-000000000002','printed',1);

select merge_profiles('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002', null);
do $$ begin
  if (select phone from profiles where id = '00000000-0000-0000-0000-000000000001') <> '+15551110000' then raise exception 'phone not moved'; end if;
  if (select source_id from profiles where id = '00000000-0000-0000-0000-000000000001') <> 'S-77' then raise exception 'registration link not moved'; end if;
  if (select details->>'Group' from profiles where id = '00000000-0000-0000-0000-000000000001') <> 'B' then raise exception 'kept details overwritten'; end if;
  if (select details->>'Shirt' from profiles where id = '00000000-0000-0000-0000-000000000001') <> 'M' then raise exception 'details not merged'; end if;
  if not exists (select 1 from staff_scopes where user_id = '00000000-0000-0000-0000-000000000001') then raise exception 'areas not moved'; end if;
  if exists (select 1 from print_jobs where requested_by = '00000000-0000-0000-0000-000000000002') then raise exception 'records not moved'; end if;
end $$;

-- a phone chosen wins
select merge_profiles('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002', '+15552220000');
do $$ begin
  if (select phone from profiles where id = '00000000-0000-0000-0000-000000000001') <> '+15552220000' then raise exception 'chosen phone ignored'; end if;
end $$;

-- not from the browser
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$ begin
  perform merge_profiles('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002', null);
  raise exception 'expected refusal';
exception when insufficient_privilege then null; end $$;
