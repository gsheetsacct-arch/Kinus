\pset pager off
with sets(label, jobs) as (values
  ('packing_am', array['6b038352-5699-47f9-bd9d-64947105f28b','7d517c82-0728-4a6c-a6bb-c6c9614b4fbd']),
  ('packing_he', array['255b1e36-ffb1-4193-a143-a2b3c180567e','ccf35cb8-fe12-46ae-aa70-5c9028417593']),
  ('packing_fr', array['9f8c07c9-531a-4119-a3ab-886cb47f7919']),
  ('lug_bmp', array['284bfab8-ae11-480b-be66-ab5afd76a02c','4afbcd92-2344-48fb-ba35-0840f15f30fc']),
  ('lug_d3', array['973b4bbd-a931-47bd-9cc5-72d0488cc844','700af8d7-6925-4c96-8de0-9ecc72a88a8e']),
  ('lug_d2', array['e4c41b4f-809f-4cf8-b343-ce2ab09d2468','58e6bfc3-7dbd-4b6c-8b59-6f457cf8051f']),
  ('lug_d1', array['3caf9876-9745-4e38-8b4e-e4776ef8caa5']),
  ('badge_am', array['537fc66b-76ab-4f4d-9908-4be65c813973','dedacae2-ed5a-47bb-931f-885126f602ed']),
  ('badge_he', array['b19514f7-0ae5-4744-8e9d-9838144902bd','0b35916e-9f1e-4c83-a2d8-ee7af3f3b68b']),
  ('badge_fr', array['59953d25-05d8-45c6-989a-fa261dd9c088']))
select s.label, count(distinct c.camper_code) as n, string_agg(distinct c.camper_code, ',') as codes,
  string_agg(distinct case when c.source_id like 'thursday:%' then c.camper_code end, ',') as thursday_codes
from sets s, unnest(s.jobs) jid join print_job_items i on i.job_id = jid::uuid join campers c on c.id = i.camper_id group by 1 order by 1;
-- this morning's staff luggage (regular camp) people whose name tag isn't a division group I queue by division
select string_agg(distinct it->>'name', '|') as others, count(distinct it->>'name')
from print_jobs j, jsonb_array_elements(j.staff_items) it where j.id = '9ad6ffde-0f76-48de-932d-640cf05e7913'
 and coalesce(it->'values'->>'DIVISION','') not in ('Division 1','Division 2','Division 3','Bar Mitzva Program','Bar Mitzvah Program','All Access','French Division','Hebrew Division');
