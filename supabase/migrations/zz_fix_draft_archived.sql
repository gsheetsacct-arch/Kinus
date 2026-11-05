-- one-off, for the draft import previewed before 0062: what a new preview would list for the
-- archived campers in it ("Archived → Back"), so applying it brings them back. Only that draft.
with imp as (
  select i.id from imports i join sessions s on s.id = i.session_id and s.is_active
  where i.status = 'previewed' order by i.created_at desc limit 1
)
update import_rows r
set action = 'update',
    changes = '[{"field": "archived", "old": "Archived", "new": "Back (in the export)"}]'::jsonb || r.changes,
    warnings = array_replace(r.warnings, 'archived in Kinus, so they stay archived; restore them from their page if they''re coming', 'archived in Kinus, and in this export again: applying brings them back')
from imp, campers c
where r.import_id = imp.id
  and c.id = r.matched_camper_id
  and c.archived_at is not null
  and r.action in ('update', 'unchanged')
  and not r.changes @> '[{"field": "archived"}]'::jsonb;

-- the draft's counts, as the preview shows them
with imp as (
  select i.id from imports i join sessions s on s.id = i.session_id and s.is_active
  where i.status = 'previewed' order by i.created_at desc limit 1
)
update imports i
set summary = i.summary || jsonb_build_object(
  'updated', (select count(*) from import_rows where import_id = i.id and action = 'update'),
  'unchanged', (select count(*) from import_rows where import_id = i.id and action = 'unchanged'))
from imp where i.id = imp.id;

-- what it marked (shown in the run's log)
select i.id as import_id, i.created_at, r.row_number, c.first_name || ' ' || c.last_name as camper, r.action, r.changes->0 as first_change
from imports i join import_rows r on r.import_id = i.id join campers c on c.id = r.matched_camper_id
where i.status = 'previewed' and r.changes @> '[{"field": "archived"}]'::jsonb;
