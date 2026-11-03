-- the activity log: more tables, rows by key, and the server acting for someone
\set ON_ERROR_STOP on
begin;
insert into settings (key, value) values ('audit_test', '{"a":1}');
update settings set value = '{"a":2}' where key = 'audit_test';
do $$ begin
  if (select count(*) from audit_log where table_name = 'settings' and row_key = 'audit_test') <> 2 then raise exception 'settings not logged by key'; end if;
  if (select diff->'value'->'new'->>'a' from audit_log where table_name = 'settings' and row_key = 'audit_test' and action = 'UPDATE') <> '2' then raise exception 'settings diff missing'; end if;
end $$;

-- the server's key, saying who it acts for
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.headers', '{"x-kinus-actor":"11111111-1111-1111-1111-111111111111","x-kinus-via":"/admin/settings"}', true);
update settings set value = '{"a":3}' where key = 'audit_test';
do $$ begin
  if (select actor_id::text from audit_log where table_name = 'settings' and row_key = 'audit_test' order by id desc limit 1) <> '11111111-1111-1111-1111-111111111111' then raise exception 'server actor not recorded'; end if;
  if (select via from audit_log where table_name = 'settings' and row_key = 'audit_test' order by id desc limit 1) <> '/admin/settings' then raise exception 'via not recorded'; end if;
end $$;

-- anyone else can't claim to be someone
select set_config('request.jwt.claims', '{"role":"anon"}', true);
update settings set value = '{"a":4}' where key = 'audit_test';
do $$ begin
  if (select actor_id from audit_log where table_name = 'settings' and row_key = 'audit_test' order by id desc limit 1) is not null then raise exception 'header trusted without the server key'; end if;
end $$;

-- a junk header doesn't break the write
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.headers', 'not json', true);
update settings set value = '{"a":5}' where key = 'audit_test';
rollback;
