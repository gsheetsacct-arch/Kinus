-- read-only diagnostic (not a migration): Thursday campers with no bunk
select d.name as division, c.camper_code, c.first_name, c.last_name, replace(c.source_id, 'thursday:', '') as reg_id,
       rd.name as regular_division, rb.name as regular_bunk
  from campers c join divisions d on d.id = c.division_id
  left join campers r on r.session_id = c.session_id and r.source_id = replace(c.source_id, 'thursday:', '')
  left join divisions rd on rd.id = r.division_id left join bunks rb on rb.id = r.bunk_id
 where c.session_id = (select id from sessions where is_active) and c.archived_at is null and d.name = 'Thursday Program - English' and c.bunk_id is null
 order by c.last_name, c.first_name;
