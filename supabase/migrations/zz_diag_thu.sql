with r as (
  select row_number, lower(regexp_replace(trim(raw->>'Name'), '\s+', ' ', 'g')) as nm, raw->>'Thursday bunks' as tb from import_rows where import_id = 'bca4719b-469d-458d-a080-9385120d474a'
), t as (
  select c.id, lower(regexp_replace(trim(c.first_name || ' ' || c.last_name), '\s+', ' ', 'g')) as nm, d.name as division
  from campers c left join divisions d on d.id = c.division_id
  where c.source_id like 'thursday:%' and c.archived_at is null and c.session_id = (select session_id from imports where id = 'bca4719b-469d-458d-a080-9385120d474a')
), m as (select r.row_number, r.nm, r.tb, count(t.id) as n, string_agg(t.division, ', ') as divs from r left join t on t.nm = r.nm group by 1,2,3)
select n as matches, count(*) as rows, count(*) filter (where coalesce(tb,'') <> '') as with_bunk from m group by n order by n;
with r as (
  select row_number, lower(regexp_replace(trim(raw->>'Name'), '\s+', ' ', 'g')) as nm, raw->>'Thursday bunks' as tb from import_rows where import_id = 'bca4719b-469d-458d-a080-9385120d474a'
), t as (
  select c.id, lower(regexp_replace(trim(c.first_name || ' ' || c.last_name), '\s+', ' ', 'g')) as nm, d.name as division
  from campers c left join divisions d on d.id = c.division_id
  where c.source_id like 'thursday:%' and c.archived_at is null
)
select r.row_number, r.nm, r.tb, count(t.id) as n, string_agg(t.division, ', ') as divs from r left join t on t.nm = r.nm group by 1,2,3 having count(t.id) <> 1 order by 1 limit 30;
