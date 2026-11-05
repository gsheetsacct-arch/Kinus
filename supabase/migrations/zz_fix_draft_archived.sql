-- read-only: the latest imports, and the rows that said "archived in Kinus"
select i.id, i.status, i.uploaded_at, i.applied_at, s.name as session, s.is_active from imports i join sessions s on s.id = i.session_id order by i.uploaded_at desc limit 4;
select i.status as import_status, i.uploaded_at, r.row_number, r.action, c.first_name || ' ' || c.last_name as camper, c.archived_at, r.changes->0 as first_change
from import_rows r join imports i on i.id = r.import_id left join campers c on c.id = r.matched_camper_id
where exists (select 1 from unnest(r.warnings) w where w like 'archived in Kinus%')
order by i.uploaded_at desc limit 10;
