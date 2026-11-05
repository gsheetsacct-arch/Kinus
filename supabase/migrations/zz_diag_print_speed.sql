-- read-only check: how much the print page's "which requests are theirs" lookup reads, before and after
\timing on
select 'all items this session (before)' as what, count(*) from print_job_items i join print_jobs j on j.id = i.job_id where j.session_id = (select id from sessions where is_active limit 1);
select 'items still to print (after)' as what, count(*) from print_job_items i join print_jobs j on j.id = i.job_id where j.session_id = (select id from sessions where is_active limit 1) and j.status in ('queued','rendering','ready','sent');
select 'items for the Printed tab' as what, count(*) from print_job_items i join print_jobs j on j.id = i.job_id where j.session_id = (select id from sessions where is_active limit 1) and j.status in ('printed','failed');
explain (analyze, buffers, format text) select i.job_id, i.camper_id, c.division_id, c.bunk_id, j.requested_by from print_job_items i join print_jobs j on j.id = i.job_id left join campers c on c.id = i.camper_id where j.session_id = (select id from sessions where is_active limit 1);
explain (analyze, buffers, format text) select i.job_id, i.camper_id, c.division_id, c.bunk_id, j.requested_by from print_job_items i join print_jobs j on j.id = i.job_id left join campers c on c.id = i.camper_id where j.session_id = (select id from sessions where is_active limit 1) and j.status in ('queued','rendering','ready','sent');
