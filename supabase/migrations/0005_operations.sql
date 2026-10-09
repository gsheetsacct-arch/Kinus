-- =============================================================================
-- Kinus — 0005: check-in operations (undo, bulk, board) and printing seeds
-- =============================================================================

alter type print_status add value if not exists 'ready';   -- rendered, waiting for the office

-- ---------------------------------------------------------------------------
-- Undo: the person who recorded a check-in/out can take it back within 30 seconds,
-- as long as nothing happened to that camper since. Recorded as a correction.
-- ---------------------------------------------------------------------------
create or replace function undo_attendance(p_event_id uuid) returns attendance_events
language plpgsql security definer set search_path = public as $$
declare
  e attendance_events;
  prev camper_status;
  ev attendance_events;
begin
  select * into e from attendance_events where id = p_event_id;
  if e is null then raise exception 'Nothing to undo.'; end if;
  if e.recorded_by is distinct from auth.uid() then raise exception 'You can only undo your own check-ins.' using errcode = '42501'; end if;
  if e.event_type = 'correction' then raise exception 'That was already undone.'; end if;
  if e.created_at < now() - interval '30 seconds' then raise exception 'Too late to undo. Ask a director to correct it.'; end if;
  perform 1 from campers where id = e.camper_id and last_event_id = e.id for update;
  if not found then raise exception 'Something else was recorded for this camper since. Ask a director to correct it.'; end if;

  select resulting_status into prev from attendance_events
    where camper_id = e.camper_id and created_at < e.created_at
    order by created_at desc limit 1;
  prev := coalesce(prev, 'expected');

  insert into attendance_events (camper_id, event_type, method, recorded_by, note, resulting_status, corrects_event_id)
  values (e.camper_id, 'correction', e.method, auth.uid(), 'Undo', prev, e.id)
  returning * into ev;
  update campers set status = prev, last_event_id = ev.id where id = e.camper_id;
  return ev;
end $$;

-- ---------------------------------------------------------------------------
-- Bulk: directors/admins apply one event to many campers; invalid transitions skip.
-- ---------------------------------------------------------------------------
create or replace function bulk_attendance(p_camper_ids uuid[], p_event_type attendance_event_type, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
  done int := 0;
  skipped int := 0;
begin
  if not (is_admin() or my_role() = 'director') then raise exception 'Only directors and admins can do this.' using errcode = '42501'; end if;
  if p_event_type = 'correction' then raise exception 'Corrections are made one camper at a time.'; end if;
  foreach cid in array p_camper_ids loop
    begin
      perform record_attendance(cid, p_event_type, 'bulk', p_note);
      done := done + 1;
    exception when sqlstate 'P0001' then
      skipped := skipped + 1;
    end;
  end loop;
  return jsonb_build_object('done', done, 'skipped', skipped);
end $$;

-- ---------------------------------------------------------------------------
-- Status board: visible camper fields + who did the last check-in/out and when.
-- ---------------------------------------------------------------------------
create or replace view campers_board with (security_invoker = true) as
select v.*,
       e.event_type  as last_event_type,
       e.occurred_at as last_event_at,
       e.method      as last_event_method,
       e.note        as last_event_note,
       p.full_name   as last_event_by
from campers_visible v
left join attendance_events e on e.id = v.last_event_id
left join profiles p on p.id = e.recorded_by;

grant select on campers_board to authenticated;

-- ---------------------------------------------------------------------------
-- Print status per camper and template (latest request), for the camper card.
-- ---------------------------------------------------------------------------
create or replace function camper_print_status(p_camper_id uuid)
returns table (template_id uuid, status print_status, requested_at timestamptz, printed_at timestamptz, requested_by_name text)
language sql stable security definer set search_path = public as $$
  select distinct on (j.template_id) j.template_id, j.status, j.requested_at, j.printed_at, p.full_name
  from print_job_items i
  join print_jobs j on j.id = i.job_id
  left join profiles p on p.id = j.requested_by
  where i.camper_id = p_camper_id and can_access_camper(p_camper_id, 'view') and j.status <> 'cancelled'
  order by j.template_id, j.requested_at desc
$$;

-- ---------------------------------------------------------------------------
-- Seeds: t-shirt codes, merge fields, two starter templates
-- ---------------------------------------------------------------------------
insert into value_maps (id, name, source_field) values
  ('c0000000-0000-0000-0000-000000000001', 'T-shirt size codes', 'tshirt_size')
on conflict (id) do nothing;

insert into value_map_entries (map_id, source_value, output_value) values
  ('c0000000-0000-0000-0000-000000000001', 'youth x-small', 'YXS'),
  ('c0000000-0000-0000-0000-000000000001', 'youth small', 'YS'),
  ('c0000000-0000-0000-0000-000000000001', 'youth medium', 'YM'),
  ('c0000000-0000-0000-0000-000000000001', 'youth large', 'YL'),
  ('c0000000-0000-0000-0000-000000000001', 'youth x-large', 'YXL'),
  ('c0000000-0000-0000-0000-000000000001', 'adult small', 'AS'),
  ('c0000000-0000-0000-0000-000000000001', 'adult medium', 'AM'),
  ('c0000000-0000-0000-0000-000000000001', 'adult large', 'AL'),
  ('c0000000-0000-0000-0000-000000000001', 'adult x-large', 'AXL')
on conflict do nothing;

insert into merge_fields (key, label, source_field, transforms, sort_order) values
  ('FIRST',         'First name',             'first_name',            '[]', 1),
  ('LAST',          'Last name',              'last_name',             '[]', 2),
  ('FULL',          'Full name',              '{{first_name}} {{last_name}}', '[]', 3),
  ('CODE',          'Camper code',            'camper_code',           '[]', 4),
  ('BARCODE',       'Barcode value',          'KN{{camper_code}}',     '[]', 5),
  ('DIVISION',      'Division',               'division',              '[]', 6),
  ('DIV',           'Division number',        'division',              '[{"type":"replace","pattern":"^Division\\s+(\\d+)$","replacement":"$1","flags":"i"}]', 7),
  ('DIVISION_COLOR','Division colour',        'division_color',        '[]', 8),
  ('BUNK',          'Bunk',                   'bunk',                  '[]', 9),
  ('BUNK_SHORT',    'Bunk without "Bunk"',    'bunk',                  '[{"type":"replace","pattern":"^Bunk\\s+","replacement":"","flags":"i"}]', 10),
  ('GRADE',         'Grade',                  'grade',                 '[]', 11),
  ('TSHIRT',        'T-shirt code',           'tshirt_size',           '[{"type":"value_map","map_id":"c0000000-0000-0000-0000-000000000001","fallback":"original"}]', 12),
  ('ADDRESS',       'Local address',          'local_address',         '[]', 13),
  ('CROSS_STREETS', 'Cross streets',          'local_address_cross_streets', '[]', 14),
  ('MOTHER_PHONE',  'Mother phone',           'contact.mother.phone',  '[]', 15),
  ('FATHER_PHONE',  'Father phone',           'contact.father.phone',  '[]', 16)
on conflict (key) do nothing;

insert into print_templates (id, kind, name, page_width_mm, page_height_mm, layers, is_default, show_on_card, auto_on_first_checkin, sort_order) values
  ('d0000000-0000-0000-0000-000000000001', 'name_tag', 'Name tag', 90, 55, '[
     {"id":"band","type":"box","x":0,"y":0,"w":4,"h":55,"fill":"{{DIVISION_COLOR}}"},
     {"id":"first","type":"text","text":"{{FIRST}}","x":8,"y":6,"w":78,"h":16,"size":26,"weight":700,"align":"center","fit":true},
     {"id":"last","type":"text","text":"{{LAST}}","x":8,"y":22,"w":78,"h":8,"size":13,"weight":400,"align":"center","fit":true},
     {"id":"where","type":"text","text":"{{DIVISION}} · {{BUNK}}","x":8,"y":31,"w":78,"h":6,"size":9,"weight":400,"align":"center","color":"#555555","fit":true},
     {"id":"code","type":"barcode","text":"{{BARCODE}}","x":17,"y":39,"w":60,"h":12,"showText":true}
   ]', true, true, false, 1),
  ('d0000000-0000-0000-0000-000000000002', 'luggage_tag', 'Luggage tag', 108, 64, '[
     {"id":"band","type":"box","x":0,"y":0,"w":108,"h":5,"fill":"{{DIVISION_COLOR}}"},
     {"id":"name","type":"text","text":"{{FULL}}","x":6,"y":9,"w":96,"h":11,"size":20,"weight":700,"align":"left","fit":true},
     {"id":"where","type":"text","text":"{{DIVISION}} · {{BUNK}}","x":6,"y":21,"w":96,"h":7,"size":12,"weight":400,"align":"left","fit":true},
     {"id":"addr","type":"text","text":"{{ADDRESS}}","x":6,"y":29,"w":96,"h":6,"size":10,"weight":400,"align":"left","color":"#444444","fit":true},
     {"id":"code","type":"barcode","text":"{{BARCODE}}","x":6,"y":40,"w":62,"h":17,"showText":true},
     {"id":"tshirt","type":"text","text":"{{TSHIRT}}","x":74,"y":44,"w":28,"h":10,"size":16,"weight":700,"align":"right","fit":true}
   ]', true, true, false, 2)
on conflict (id) do nothing;
