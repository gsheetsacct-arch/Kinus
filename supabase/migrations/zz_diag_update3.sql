-- read-only: who is on the evening update's requests (new = first time on that template), and the badge set's codes
select t.name as template, c.camper_code, c.first_name || ' ' || c.last_name as name, d.name as division, b.name as bunk, c.current_buzzer_number as buzzer,
  case when exists (select 1 from print_job_items i2 join print_jobs j2 on j2.id = i2.job_id where i2.camper_id = c.id and j2.template_id = j.template_id and j2.id <> j.id and j2.status not in ('cancelled','failed') and j2.requested_at < j.requested_at) then 'swap' else 'new' end as kind
from print_jobs j join print_templates t on t.id = j.template_id join print_job_items i on i.job_id = j.id join campers c on c.id = i.camper_id
left join divisions d on d.id = c.division_id left join bunks b on b.id = c.bunk_id
where j.id in ('f7f34563-5d25-4399-858e-72316e360fbd','bc37b151-41a8-426b-a3f0-e52daf722a21','5dd0036f-619f-4768-b9f8-83dfb28c7fda','afb87a88-e850-49fb-8a80-4169435a459c','023f3b2c-92e8-462b-89d9-7ac296e753fb','2610b56e-b5bb-44d8-99f1-a59a0c283650','0d609543-b9df-41d0-8ece-5bd04b9239ea','7a565e14-37e2-4048-9214-f84dbf04d16f','36069842-09a3-4055-9cf6-eac83654354e')
order by t.name, d.name, b.name, c.last_name;
select j.note from print_jobs j where j.id = '0c859784-481c-4933-8060-2f7beec8abd8';
select c.camper_code, c.first_name || ' ' || c.last_name as name, g.name as camp, d.name as division, b.name as bunk,
  exists (select 1 from print_job_items i join print_jobs j on j.id = i.job_id join print_templates t on t.id = j.template_id where i.camper_id = c.id and t.kind = 'name_tag' and t.name like 'Name Tag/Badge%' and j.status not in ('cancelled','failed')) as had_badge
from campers c join sessions s on s.id = c.session_id and s.is_active left join divisions d on d.id = c.division_id left join division_groups g on g.id = d.group_id left join bunks b on b.id = c.bunk_id
where c.archived_at is null and lower(c.first_name || ' ' || c.last_name) in (
 'shneur horowitz','nochum gorelik','avraham moshe dolnikov','mendel laufer','eliezer wenger','dovber lang','eliyahu dworcan','tzemach weg','yisroel aryeh leib greenberg','yosef altein','neiach weg',
 'eliahou levy','elyaou lumbroso','menahem mendel belaich','yossef itshaq nadjar')
order by g.name, d.name, c.last_name;
