\pset pager off
select to_char(j.printed_at at time zone 'America/New_York', 'Mon DD HH24:MI') as marked_printed, to_char(j.requested_at at time zone 'America/New_York', 'Mon DD HH24:MI') as asked, t.name as tag, j.item_count, j.id, left(j.note, 80) as note
from print_jobs j join print_templates t on t.id = j.template_id
where j.status = 'printed' and j.printed_at > now() - interval '40 hours' order by j.printed_at, j.requested_at;
select to_char(j.requested_at at time zone 'America/New_York', 'Mon DD HH24:MI') as asked, j.status, t.name as tag, j.item_count, j.id, left(j.note, 70) as note
from print_jobs j join print_templates t on t.id = j.template_id where j.status not in ('printed','cancelled') order by j.requested_at;
