\set ON_ERROR_STOP on
-- 0025: divisions of a new session go into the camps they were in last session.
insert into sessions (id, name, is_active, created_at) values ('10000000-0000-0000-0000-000000000001', '5786', false, now() - interval '1 year');
insert into division_groups (id, session_id, name, sort_order) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'American', 0),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Machane Ivri', 1),
  ('50000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Français', 2);
insert into divisions (session_id, name, group_id) values
  ('10000000-0000-0000-0000-000000000001', 'Division 1', '50000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000001', 'Kitah Alef', '50000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000001', 'Groupe Bleu', '50000000-0000-0000-0000-000000000003');
-- the new session: the import creates its divisions (no camp chosen)
insert into sessions (id, name, is_active) values ('10000000-0000-0000-0000-000000000002', '5787', true);
insert into divisions (session_id, name) values
  ('10000000-0000-0000-0000-000000000002', 'Division 1'),
  ('10000000-0000-0000-0000-000000000002', 'kitah alef'),
  ('10000000-0000-0000-0000-000000000002', 'Groupe Bleu'),
  ('10000000-0000-0000-0000-000000000002', 'Brand New Division');
do $$ begin
  if (select string_agg(d.name || '=' || g.name, ', ' order by d.name) from divisions d join division_groups g on g.id = d.group_id where d.session_id = '10000000-0000-0000-0000-000000000002')
     <> 'Brand New Division=American, Division 1=American, Groupe Bleu=Français, kitah alef=Machane Ivri' then
    raise exception 'camps not carried over: %', (select string_agg(d.name || '=' || g.name, ', ' order by d.name) from divisions d join division_groups g on g.id = d.group_id where d.session_id = '10000000-0000-0000-0000-000000000002');
  end if;
  if (select string_agg(name, ',' order by sort_order) from division_groups where session_id = '10000000-0000-0000-0000-000000000002') <> 'American,Machane Ivri,Français' then
    raise exception 'camp order not kept';
  end if;
end $$;
