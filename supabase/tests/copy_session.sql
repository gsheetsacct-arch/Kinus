\set ON_ERROR_STOP on
-- 0026: a new session starts from the last one's setup (not its campers).
insert into auth.users (id, email, raw_app_meta_data) values
 ('00000000-0000-0000-0000-000000000001','owner@x.com','{"full_name":"Owner","role":"owner","all_areas":true}'),
 ('00000000-0000-0000-0000-000000000002','hc@x.com','{"full_name":"HC","role":"head_counselor"}');
insert into sessions (id, name, is_active) values ('10000000-0000-0000-0000-000000000001', '5786', true), ('10000000-0000-0000-0000-000000000002', '5787', false);
insert into division_groups (id, session_id, name, sort_order) values ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Machane Ivri', 1);
insert into divisions (id, session_id, name, language, color, sort_order, group_id) values
 ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Kitah Alef', 'he', '#dc2626', 3, '50000000-0000-0000-0000-000000000001');
insert into bunks (id, division_id, name, sort_order) values ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Bunk Yud', 2);
insert into campers (session_id, first_name, last_name, division_id) values ('10000000-0000-0000-0000-000000000001', 'Last', 'Year', '20000000-0000-0000-0000-000000000001');
insert into staff_scopes (user_id, division_id, bunk_id) values ('00000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001');

-- the import already made the division in the new session, in the main camp, no colour
insert into divisions (session_id, name, sort_order) values ('10000000-0000-0000-0000-000000000002', 'Kitah Alef', 9);
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select copy_session_setup('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002');
select copy_session_setup('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002'); -- twice: nothing doubles
reset role;
do $$ begin
  if (select count(*) from divisions d join division_groups g on g.id = d.group_id
       where d.session_id = '10000000-0000-0000-0000-000000000002' and d.name = 'Kitah Alef' and d.language = 'he' and d.color = '#dc2626' and d.sort_order = 3 and g.name = 'Machane Ivri') <> 1 then
    raise exception 'division not copied with its settings';
  end if;
  if (select count(*) from bunks b join divisions d on d.id = b.division_id where d.session_id = '10000000-0000-0000-0000-000000000002' and b.name = 'Bunk Yud') <> 1 then raise exception 'bunk not copied'; end if;
  if (select count(*) from campers where session_id = '10000000-0000-0000-0000-000000000002') <> 0 then raise exception 'campers copied'; end if;
  if (select count(*) from staff_scopes s join bunks b on b.id = s.bunk_id join divisions d on d.id = b.division_id
       where s.user_id = '00000000-0000-0000-0000-000000000002' and d.session_id = '10000000-0000-0000-0000-000000000002') <> 1 then raise exception 'staff area not copied'; end if;
end $$;

-- a counselor can't run it
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$ begin
  perform copy_session_setup('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002');
  raise exception 'a head counselor copied a session';
exception when insufficient_privilege then null; end $$;
