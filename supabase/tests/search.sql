\set ON_ERROR_STOP on
-- 0055: searching export columns and the activity log
insert into sessions (id,name,is_active) values ('10000000-0000-0000-0000-000000000001','Kinus',true);
insert into divisions (id, session_id, name) values ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Division 1');
insert into campers (id, session_id, division_id, camper_code, first_name, last_name, source_data, source_fixes)
values ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','0001','Levi','Cohen',
        '{"ppa.shirt":"Medium","ppa.hebrew_name":"Levi"}', '{"ppa.hebrew_name":{"value":"לוי","was":"Levi"}}');
do $$ begin
  if (select count(*) from search_camper_columns('10000000-0000-0000-0000-000000000001', '%medi%')) <> 1 then raise exception 'column not found'; end if;
  if (select value from search_camper_columns('10000000-0000-0000-0000-000000000001', '%לוי%') limit 1) <> 'לוי' then raise exception 'fix not searched'; end if;
  if not exists (select 1 from search_audit('%Cohen%')) then raise exception 'audit not searched'; end if;
end $$;
set role authenticated;
do $$ begin
  perform search_audit('%a%');
  raise exception 'expected refusal';
exception when insufficient_privilege then null; end $$;
