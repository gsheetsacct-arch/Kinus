\set ON_ERROR_STOP on
-- Fixes to export columns: kept when an import refreshes the columns, and carried over to
-- next session's camper (same registration id) while the registration still says the same.
insert into sessions (id,name,is_active) values
 ('10000000-0000-0000-0000-000000000001','Last year',false),
 ('10000000-0000-0000-0000-000000000002','This year',true);
insert into campers (id, session_id, source_id, first_name, last_name, source_data, source_fixes) values
 ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','s1','Menachem','Cohen',
  '{"ppa#hebrew_name":"nun shin beis tes","ppa.hebrew_last_name":"Cohen"}',
  '{"ppa.hebrew_name":{"value":"נשבט","was":"nun shin beis tes"},"ppa.hebrew_last_name":{"value":"כהן","was":"Cohen"}}');

-- an import refreshing the columns leaves the fixes alone
select set_config('kinus.audit_source', 'import:x', false);
update campers set source_data = '{"ppa#hebrew_name":"nun shin beis tes","ppa.hebrew_last_name":"Cohen","grade":"5"}' where id = '40000000-0000-0000-0000-000000000001';
do $$ begin
  assert (select source_fixes->'ppa.hebrew_name'->>'value' from campers where id = '40000000-0000-0000-0000-000000000001') = 'נשבט', 'fix kept on refresh';
end $$;

-- next year: the first name still reads the same (carried over), the last name was corrected
-- in registration (the registration's own value is used again)
insert into campers (id, session_id, source_id, first_name, last_name, source_data) values
 ('40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','s1','Menachem','Cohen',
  '{"PPA.Hebrew_Name ":"nun shin beis tes","ppa.hebrew_last_name":"כהן"}');
-- someone else with the same wrong value gets nothing
insert into campers (id, session_id, source_id, first_name, last_name, source_data) values
 ('40000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002','s2','Other','Kid',
  '{"ppa.hebrew_name":"nun shin beis tes"}');
do $$ begin
  assert (select source_fixes from campers where id = '40000000-0000-0000-0000-000000000002') = '{"ppa.hebrew_name":{"value":"נשבט","was":"nun shin beis tes"}}'::jsonb, 'carried over only what still applies';
  assert (select source_fixes from campers where id = '40000000-0000-0000-0000-000000000003') = '{}'::jsonb, 'nobody else';
end $$;
