-- read-only: how big the import review's rows are, whole vs only what the page shows
select i.id, i.status, count(*) as rows,
  pg_size_pretty(sum(pg_column_size(r.parsed))::bigint) as parsed_whole,
  pg_size_pretty(sum(coalesce(octet_length(r.parsed->>'first_name'),0) + coalesce(octet_length(r.parsed->>'last_name'),0) + coalesce(octet_length(r.parsed->>'source_id'),0) + coalesce(octet_length(r.parsed->>'division_name'),0) + coalesce(octet_length(r.parsed->>'bunk_name'),0))::bigint) as parsed_needed,
  pg_size_pretty(sum(pg_column_size(r.changes))::bigint) as changes
from imports i join import_rows r on r.import_id = i.id
group by i.id, i.status, i.created_at order by i.created_at desc limit 3;
