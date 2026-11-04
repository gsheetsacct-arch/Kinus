select k, count(*) as campers from campers c, jsonb_object_keys(c.source_data) k
 where c.session_id = (select id from sessions where is_active) and c.archived_at is null and (k ilike '%sleep%' or k ilike '%stay%' or k ilike '%kinus%' or k ilike '%lodg%' or k ilike '%hous%')
 group by k order by k;
select value from settings where key = 'extra_fields';
