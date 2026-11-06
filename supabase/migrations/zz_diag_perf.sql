-- read-only: audit_log size and how long the camper page's history lookup takes
\pset footer off
select table_name, count(*), pg_size_pretty(sum(pg_column_size(a.*))::bigint) as size from audit_log a group by 1 order by 2 desc limit 8;
select pg_size_pretty(pg_total_relation_size('audit_log')) as audit_total, pg_size_pretty(pg_total_relation_size('campers')) as campers_total, pg_size_pretty(pg_total_relation_size('attendance_events')) as events_total;
explain (analyze, buffers off, timing on, summary on)
  select a.id from audit_log a where a.table_name = 'campers' and a.row_id = (select id from campers order by updated_at desc limit 1)
  union
  select a.id from audit_log a where a.table_name = 'camper_contacts' and (a.after->>'camper_id')::uuid = (select id from campers order by updated_at desc limit 1)
  union
  select a.id from audit_log a where a.table_name = 'camper_contacts' and (a.before->>'camper_id')::uuid = (select id from campers order by updated_at desc limit 1);
explain (analyze, summary on) select * from campers_board where session_id = (select id from sessions where is_active) limit 2000;
select relname, seq_scan, idx_scan, n_live_tup from pg_stat_user_tables order by seq_scan desc limit 12;
