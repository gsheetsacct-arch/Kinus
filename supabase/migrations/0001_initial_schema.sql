-- =============================================================================
-- Kinus — initial schema (DRAFT v0). Not yet applied to a Supabase project;
-- validated locally on Postgres 16 with stubbed auth/storage schemas (see docs/02).
-- Target: Supabase Postgres 15+. Apply with `supabase db push`.
-- See docs/02-data-model.md and docs/03-permissions.md.
-- =============================================================================

create extension if not exists pgcrypto;
create extension if not exists unaccent;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type global_role as enum ('owner', 'admin', 'director', 'logistics', 'office', 'staff');
-- staff = no global access; everything comes from staff_scopes rows.

create type scope_role   as enum ('division_head', 'head_counselor', 'counselor', 'scanner');
create type access_level as enum ('view', 'scan', 'edit');   -- ordered: view < scan < edit
create type division_language as enum ('he', 'fr', 'en');

create type camper_status as enum ('expected', 'present', 'out', 'departed', 'no_show');
create type attendance_event_type as enum ('arrival', 'leave', 'return', 'pickup', 'no_show', 'correction');
create type attendance_method as enum ('scan', 'manual', 'bulk');

create type contact_role   as enum ('mother', 'father', 'guardian', 'emergency', 'host', 'authorized_pickup');
create type record_source  as enum ('import', 'manual');

create type import_status  as enum ('uploaded', 'previewed', 'applied', 'cancelled', 'failed');
create type import_row_action as enum ('add', 'update', 'unchanged', 'conflict', 'skip');

create type print_kind   as enum ('name_tag', 'luggage_tag', 'other');
create type print_status as enum ('queued', 'rendering', 'sent', 'printed', 'failed', 'cancelled');
create type page_status  as enum ('queued', 'sent', 'failed', 'manual');

-- ---------------------------------------------------------------------------
-- Sessions, divisions, bunks
-- ---------------------------------------------------------------------------
create table sessions (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  starts_on   date,
  ends_on     date,
  is_active   boolean not null default false,
  created_at  timestamptz not null default now()
);
create unique index sessions_one_active on sessions ((true)) where is_active;

create table divisions (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions(id) on delete cascade,
  name        text not null,                 -- as written in the export
  language    division_language not null default 'en',
  color       text,                          -- hex, for board / tags
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  unique (session_id, name)
);

create table bunks (
  id          uuid primary key default gen_random_uuid(),
  division_id uuid not null references divisions(id) on delete cascade,
  name        text not null,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  unique (division_id, name)
);

-- ---------------------------------------------------------------------------
-- Campers
-- ---------------------------------------------------------------------------
create sequence camper_code_seq start 10001;

-- 5-digit sequence + Luhn check digit → 6-digit camper_code
create or replace function next_camper_code() returns text language plpgsql as $$
declare
  base text := lpad(nextval('camper_code_seq')::text, 5, '0');
  s int := 0; d int; i int; dbl boolean := true;
begin
  for i in reverse 5..1 loop
    d := substr(base, i, 1)::int;
    if dbl then d := d * 2; if d > 9 then d := d - 9; end if; end if;
    s := s + d; dbl := not dbl;
  end loop;
  return base || ((10 - (s % 10)) % 10)::text;
end $$;

-- Search normalisation: lowercase, strip accents, strip Hebrew niqqud/cantillation,
-- map Hebrew final letters to regular forms, collapse whitespace.
create or replace function normalize_name(t text) returns text
language sql immutable as $$
  select regexp_replace(
           translate(
             regexp_replace(lower(unaccent(coalesce(t, ''))), '[֑-ׇ]', '', 'g'),
             'ךםןףץ', 'כמנפצ'),
           '\s+', ' ', 'g')
$$;

create table campers (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references sessions(id) on delete cascade,
  camper_code    text not null unique default next_camper_code(),
  source_id      text,                                        -- students.id
  first_name     text not null,
  last_name      text not null,
  display_name   text generated always as (first_name || ' ' || last_name) stored,
  name_normalized text generated always as (normalize_name(first_name || ' ' || last_name)) stored,
  division_id    uuid references divisions(id) on delete set null,
  bunk_id        uuid references bunks(id) on delete set null,
  bunk_locked_by_staff boolean not null default false,
  grade          text,
  tshirt_size    text,
  bunk_preferences text[] not null default '{}',
  local_address  text,
  local_address_cross_streets text,
  -- sensitive
  medical_notes  text,
  allergies      text,
  has_allergies  boolean,
  has_epipen     boolean,
  has_medications boolean,
  notes_from_parents text,
  staff_notes    text,
  -- denormalised operational state
  status         camper_status not null default 'expected',
  last_event_id  uuid,                                       -- fk added after attendance_events
  current_buzzer_number int,
  in_latest_import boolean not null default true,
  source_data    jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  archived_at    timestamptz,
  unique (session_id, source_id)
);
create index campers_name_trgm on campers using gin (name_normalized gin_trgm_ops);
create index campers_division_bunk on campers (session_id, division_id, bunk_id);
create index campers_status on campers (session_id, status);

create table camper_contacts (
  id          uuid primary key default gen_random_uuid(),
  camper_id   uuid not null references campers(id) on delete cascade,
  role        contact_role not null,
  slot        smallint not null default 1,
  name        text,
  phone       text,
  phone_e164  text,
  email       text,
  is_primary  boolean not null default false,
  can_pickup  boolean not null default true,
  source      record_source not null default 'import',
  created_at  timestamptz not null default now(),
  unique (camper_id, role, slot)
);
create index camper_contacts_phone on camper_contacts (phone_e164);

-- ---------------------------------------------------------------------------
-- Staff, roles, scopes
-- ---------------------------------------------------------------------------
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  full_name     text not null,
  phone         text,
  global_role   global_role not null default 'staff',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table staff_scopes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  division_id   uuid not null references divisions(id) on delete cascade,
  bunk_id       uuid references bunks(id) on delete cascade,   -- null = whole division
  scope_role    scope_role not null,
  access_level  access_level not null default 'scan',
  created_at    timestamptz not null default now(),
  created_by    uuid references profiles(id),
  unique (user_id, division_id, bunk_id)
);

-- Which roles may see which sensitive field groups (doc 3).
create table field_visibility (
  field_group     text primary key,            -- 'contacts', 'medical', 'parent_notes', 'address', 'staff_notes'
  global_roles    global_role[] not null default '{owner,admin,director}',
  scope_roles     scope_role[]  not null default '{division_head}'
);
insert into field_visibility (field_group, global_roles, scope_roles) values
  ('contacts',     '{owner,admin,director,logistics,office}', '{division_head,head_counselor,counselor}'),
  ('medical',      '{owner,admin,director}',                  '{division_head,head_counselor}'),
  ('parent_notes', '{owner,admin,director}',                  '{division_head,head_counselor}'),
  ('address',      '{owner,admin,director,logistics}',        '{division_head,head_counselor}'),
  ('staff_notes',  '{owner,admin,director,logistics}',        '{division_head,head_counselor,counselor}');

create table settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references profiles(id)
);

-- ---------------------------------------------------------------------------
-- Attendance
-- ---------------------------------------------------------------------------
create table attendance_events (
  id               uuid primary key default gen_random_uuid(),
  camper_id        uuid not null references campers(id) on delete cascade,
  event_type       attendance_event_type not null,
  method           attendance_method not null default 'manual',
  occurred_at      timestamptz not null default now(),
  recorded_by      uuid references profiles(id),
  note             text,
  resulting_status camper_status not null,
  corrects_event_id uuid references attendance_events(id),
  device_label     text,
  created_at       timestamptz not null default now()
);
create index attendance_events_camper on attendance_events (camper_id, occurred_at desc);
create index attendance_events_time   on attendance_events (occurred_at desc);
alter table campers add constraint campers_last_event_fk
  foreign key (last_event_id) references attendance_events(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Buzzers / pagers
-- ---------------------------------------------------------------------------
create table buzzers (
  session_id  uuid not null references sessions(id) on delete cascade,
  number      int not null,
  label       text,
  is_active   boolean not null default true,
  primary key (session_id, number)
);

create table buzzer_assignments (
  id            uuid primary key default gen_random_uuid(),
  camper_id     uuid not null references campers(id) on delete cascade,
  session_id    uuid not null references sessions(id) on delete cascade,
  buzzer_number int not null,
  assigned_at   timestamptz not null default now(),
  assigned_by   uuid references profiles(id),
  released_at   timestamptz,
  released_by   uuid references profiles(id),
  foreign key (session_id, buzzer_number) references buzzers(session_id, number)
);
create unique index buzzer_open_per_buzzer on buzzer_assignments (session_id, buzzer_number) where released_at is null;
create unique index buzzer_open_per_camper on buzzer_assignments (camper_id) where released_at is null;

create table page_requests (
  id             uuid primary key default gen_random_uuid(),
  assignment_id  uuid not null references buzzer_assignments(id) on delete cascade,
  buzzer_number  int not null,
  requested_by   uuid references profiles(id),
  requested_at   timestamptz not null default now(),
  status         page_status not null default 'queued',
  sent_at        timestamptz,
  error          text,
  bridge_id      text
);
create index page_requests_queue on page_requests (status, requested_at) where status = 'queued';

-- ---------------------------------------------------------------------------
-- Imports
-- ---------------------------------------------------------------------------
create table import_mappings (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  column_map  jsonb not null,        -- { "students.id": "source_id", ... } see doc 4
  options     jsonb not null default '{}',  -- { "bunkColumns": ["group_types.hebrew_bunks","group_types.bunks"], "yesValues": [...] }
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  created_by  uuid references profiles(id)
);

create table imports (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references sessions(id) on delete cascade,
  mapping_id    uuid references import_mappings(id),
  file_name     text not null,
  file_path     text not null,          -- storage: imports/<id>/<file>
  file_hash     text,
  status        import_status not null default 'uploaded',
  options       jsonb not null default '{}',  -- { "takeBunksFromFile": false, "divisionsInFile": [...] }
  summary       jsonb,                   -- { added, updated, unchanged, conflicts, missing, newDivisions, newBunks }
  uploaded_by   uuid references profiles(id),
  uploaded_at   timestamptz not null default now(),
  applied_at    timestamptz,
  applied_by    uuid references profiles(id),
  error         text
);

create table import_rows (
  id             uuid primary key default gen_random_uuid(),
  import_id      uuid not null references imports(id) on delete cascade,
  row_number     int not null,
  raw            jsonb not null,
  parsed         jsonb,                  -- after mapping, before apply
  matched_camper_id uuid references campers(id) on delete set null,
  match_method   text,                   -- 'source_id' | 'name_dob' | 'manual' | null
  action         import_row_action not null default 'skip',
  changes        jsonb not null default '[]',   -- [{ "field": "bunk", "old": "3", "new": "4" }]
  warnings       text[] not null default '{}',
  applied        boolean not null default false,
  unique (import_id, row_number)
);

-- ---------------------------------------------------------------------------
-- Printing
-- ---------------------------------------------------------------------------
create table print_templates (
  id            uuid primary key default gen_random_uuid(),
  kind          print_kind not null,
  name          text not null,
  division_id   uuid references divisions(id) on delete set null,   -- null = default for kind
  page_width_mm numeric not null,
  page_height_mm numeric not null,
  background_path text,                 -- storage: templates/<id>/bg.png
  layers        jsonb not null default '[]',   -- see doc 6
  sheet_layout  jsonb,                  -- optional N-up: { cols, rows, marginMm, gapMm, paper: 'letter' }
  is_default    boolean not null default false,
  show_on_card  boolean not null default true,     -- one-tap "print this" button on the camper card
  auto_on_first_checkin boolean not null default false,  -- request automatically on a camper's first check-in
  sort_order    int not null default 0,
  source_file_path text,                -- original designer file (.pub) kept in Storage for reference
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Merge fields: the named fields a mail-merge template consumes, derived from camper
-- data through a chain of transforms (value maps, regex, templates, case). See doc 6.
create table value_maps (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  source_field text not null,          -- field catalog key, e.g. 'tshirt_size', 'division.name'
  created_at   timestamptz not null default now()
);
create table value_map_entries (
  map_id        uuid not null references value_maps(id) on delete cascade,
  source_value  text not null,         -- matched trimmed + case-insensitive
  output_value  text not null,
  primary key (map_id, source_value)
);
create table merge_fields (
  id           uuid primary key default gen_random_uuid(),
  key          text not null unique,   -- as used in templates: {{TSHIRT}} / Publisher field «TSHIRT»
  label        text not null,
  source_field text not null,
  transforms   jsonb not null default '[]',
  -- e.g. [{"type":"value_map","map_id":"…","fallback":"passthrough"},
  --       {"type":"regex","pattern":"^Division (\\d+)$","replace":"$1"},
  --       {"type":"case","mode":"upper"}]
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

create table print_jobs (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references sessions(id) on delete cascade,
  kind           print_kind not null,
  template_id    uuid references print_templates(id),
  deliver_to     text not null,          -- email; defaults from settings.office_email
  requested_by   uuid references profiles(id),
  requested_at   timestamptz not null default now(),
  status         print_status not null default 'queued',
  pdf_path       text,
  item_count     int not null default 0,
  email_message_id text,
  error          text,
  printed_at     timestamptz,
  printed_by     uuid references profiles(id),
  note           text
);
create index print_jobs_queue on print_jobs (status, requested_at) where status in ('queued','rendering');

create table print_job_items (
  job_id     uuid not null references print_jobs(id) on delete cascade,
  camper_id  uuid not null references campers(id) on delete cascade,
  copies     smallint not null default 1,
  primary key (job_id, camper_id)
);

-- ---------------------------------------------------------------------------
-- Lists
-- ---------------------------------------------------------------------------
create table list_presets (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  audience     text not null,          -- 'counselor' | 'head_counselor' | 'division_head' | 'director' | 'office' | 'custom'
  columns      jsonb not null,         -- ["display_name","bunk","grade","has_allergies",...] keys from lib/fields.ts
  sort         jsonb not null default '[{"field":"last_name","dir":"asc"}]',
  group_by     text,                   -- 'bunk' | 'division' | null
  filters      jsonb not null default '{}',
  is_default   boolean not null default false,
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------
create table audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor_id    uuid,
  source      text not null default 'ui',   -- 'ui' | 'import:<uuid>' | 'system'
  table_name  text not null,
  row_id      uuid,
  action      text not null,                 -- INSERT | UPDATE | DELETE
  before      jsonb,
  after       jsonb,
  diff        jsonb
);
create index audit_log_row on audit_log (table_name, row_id, at desc);

create or replace function audit_trigger() returns trigger language plpgsql security definer as $$
declare
  b jsonb; a jsonb; d jsonb := '{}'::jsonb; k text;
begin
  if tg_op <> 'INSERT' then b := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then a := to_jsonb(new); end if;
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(a) loop
      if a->k is distinct from b->k and k not in ('updated_at') then
        d := d || jsonb_build_object(k, jsonb_build_object('old', b->k, 'new', a->k));
      end if;
    end loop;
    if d = '{}'::jsonb then return null; end if;
  end if;
  insert into audit_log (actor_id, source, table_name, row_id, action, before, after, diff)
  values (auth.uid(),
          coalesce(current_setting('kinus.audit_source', true), 'ui'),
          tg_table_name,
          coalesce((a->>'id')::uuid, (b->>'id')::uuid),
          tg_op, b, a, nullif(d, '{}'::jsonb));
  return null;
end $$;

create trigger campers_audit after insert or update or delete on campers
  for each row execute function audit_trigger();
create trigger camper_contacts_audit after insert or update or delete on camper_contacts
  for each row execute function audit_trigger();
create trigger staff_scopes_audit after insert or update or delete on staff_scopes
  for each row execute function audit_trigger();
create trigger profiles_audit after update on profiles
  for each row execute function audit_trigger();
create trigger buzzer_assignments_audit after insert or update on buzzer_assignments
  for each row execute function audit_trigger();

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger campers_touch before update on campers for each row execute function touch_updated_at();
create trigger print_templates_touch before update on print_templates for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Permission helpers (used by RLS and by the RPCs)
-- ---------------------------------------------------------------------------
create or replace function my_role() returns global_role
language sql stable security definer set search_path = public as $$
  select coalesce((select global_role from profiles where id = auth.uid() and is_active), 'staff'::global_role)
$$;

create or replace function is_admin() returns boolean
language sql stable as $$ select my_role() in ('owner','admin') $$;

create or replace function level_rank(l access_level) returns int
language sql immutable as $$
  select case l when 'view' then 1 when 'scan' then 2 when 'edit' then 3 end
$$;

-- Global roles map to an implicit session-wide level.
create or replace function global_level() returns access_level
language sql stable as $$
  select case my_role()
           when 'owner' then 'edit' when 'admin' then 'edit' when 'director' then 'edit'
           when 'logistics' then 'scan' when 'office' then 'view'
           else null end::access_level
$$;

-- True if the current user may act on a camper at the given level.
create or replace function can_access_camper(p_camper_id uuid, p_needed access_level) returns boolean
language sql stable security definer set search_path = public as $$
  select
    coalesce(level_rank(global_level()) >= level_rank(p_needed), false)
    or exists (
      select 1
      from campers c
      join staff_scopes s on s.user_id = auth.uid()
                         and s.division_id = c.division_id
                         and (s.bunk_id is null or s.bunk_id = c.bunk_id)
      where c.id = p_camper_id
        and level_rank(s.access_level) >= level_rank(p_needed)
    )
$$;

create or replace function can_access_division(p_division_id uuid, p_needed access_level) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(level_rank(global_level()) >= level_rank(p_needed), false)
    or exists (select 1 from staff_scopes s
               where s.user_id = auth.uid() and s.division_id = p_division_id
                 and level_rank(s.access_level) >= level_rank(p_needed))
$$;

-- Field-group visibility (used by the masking view).
create or replace function can_view_field_group(p_group text, p_camper_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from field_visibility fv
    where fv.field_group = p_group
      and ( my_role() = any(fv.global_roles)
            or exists (select 1 from staff_scopes s join campers c on c.id = p_camper_id
                       where s.user_id = auth.uid() and s.division_id = c.division_id
                         and (s.bunk_id is null or s.bunk_id = c.bunk_id)
                         and s.scope_role = any(fv.scope_roles)) )
  )
$$;

-- ---------------------------------------------------------------------------
-- Masked view: what the app reads for lists/boards/cards
-- ---------------------------------------------------------------------------
create or replace view campers_visible with (security_invoker = true) as
select
  c.id, c.session_id, c.camper_code, c.source_id, c.first_name, c.last_name,
  c.display_name, c.division_id, c.bunk_id, c.grade, c.tshirt_size, c.bunk_preferences,
  c.status, c.last_event_id, c.current_buzzer_number, c.in_latest_import,
  c.updated_at, c.archived_at,
  case when can_view_field_group('address', c.id) then c.local_address end               as local_address,
  case when can_view_field_group('address', c.id) then c.local_address_cross_streets end as local_address_cross_streets,
  case when can_view_field_group('medical', c.id) then c.medical_notes end               as medical_notes,
  case when can_view_field_group('medical', c.id) then c.allergies end                   as allergies,
  case when can_view_field_group('medical', c.id) then c.has_allergies end               as has_allergies,
  case when can_view_field_group('medical', c.id) then c.has_epipen end                  as has_epipen,
  case when can_view_field_group('medical', c.id) then c.has_medications end             as has_medications,
  case when can_view_field_group('parent_notes', c.id) then c.notes_from_parents end     as notes_from_parents,
  case when can_view_field_group('staff_notes', c.id) then c.staff_notes end             as staff_notes,
  -- a flag counselors can always see, even without medical detail:
  (coalesce(c.has_allergies,false) or coalesce(c.has_epipen,false) or coalesce(c.has_medications,false)) as has_medical_flag
from campers c;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table sessions            enable row level security;
alter table divisions           enable row level security;
alter table bunks               enable row level security;
alter table campers             enable row level security;
alter table camper_contacts     enable row level security;
alter table profiles            enable row level security;
alter table staff_scopes        enable row level security;
alter table field_visibility    enable row level security;
alter table settings            enable row level security;
alter table attendance_events   enable row level security;
alter table buzzers             enable row level security;
alter table buzzer_assignments  enable row level security;
alter table page_requests       enable row level security;
alter table import_mappings     enable row level security;
alter table imports             enable row level security;
alter table import_rows         enable row level security;
alter table print_templates     enable row level security;
alter table value_maps          enable row level security;
alter table value_map_entries   enable row level security;
alter table merge_fields        enable row level security;
alter table print_jobs          enable row level security;
alter table print_job_items     enable row level security;
alter table list_presets        enable row level security;
alter table audit_log           enable row level security;

-- Reference data: readable by every signed-in staff member; writable by admins.
create policy sessions_read  on sessions  for select to authenticated using (true);
create policy sessions_admin on sessions  for all    to authenticated using (is_admin()) with check (is_admin());
create policy divisions_read on divisions for select to authenticated using (true);
create policy divisions_admin on divisions for all   to authenticated using (is_admin()) with check (is_admin());
create policy bunks_read     on bunks     for select to authenticated using (true);
create policy bunks_admin    on bunks     for all    to authenticated using (is_admin()) with check (is_admin());
create policy fv_read        on field_visibility for select to authenticated using (true);
create policy fv_admin       on field_visibility for all to authenticated using (is_admin()) with check (is_admin());
create policy settings_read  on settings  for select to authenticated using (true);
create policy settings_admin on settings  for all    to authenticated using (is_admin()) with check (is_admin());
create policy presets_read   on list_presets for select to authenticated using (true);
create policy presets_admin  on list_presets for all to authenticated using (is_admin()) with check (is_admin());
create policy templates_read on print_templates for select to authenticated using (true);
create policy templates_admin on print_templates for all to authenticated using (is_admin()) with check (is_admin());
create policy value_maps_read  on value_maps for select to authenticated using (true);
create policy value_maps_admin on value_maps for all to authenticated using (is_admin()) with check (is_admin());
create policy vme_read         on value_map_entries for select to authenticated using (true);
create policy vme_admin        on value_map_entries for all to authenticated using (is_admin()) with check (is_admin());
create policy merge_fields_read  on merge_fields for select to authenticated using (true);
create policy merge_fields_admin on merge_fields for all to authenticated using (is_admin()) with check (is_admin());

-- Campers: scoped by can_access_camper. Inserts only via import (service role) or admins.
create policy campers_select on campers for select to authenticated using (can_access_camper(id, 'view'));
create policy campers_update on campers for update to authenticated
  using (can_access_camper(id, 'edit')) with check (can_access_camper(id, 'edit'));
create policy campers_insert on campers for insert to authenticated with check (is_admin());
create policy campers_delete on campers for delete to authenticated using (is_admin());

create policy contacts_select on camper_contacts for select to authenticated
  using (can_access_camper(camper_id, 'view') and can_view_field_group('contacts', camper_id));
create policy contacts_write on camper_contacts for all to authenticated
  using (can_access_camper(camper_id, 'edit')) with check (can_access_camper(camper_id, 'edit'));

-- Profiles: everyone sees active colleagues' names (needed for "checked in by"); admins manage.
create policy profiles_select on profiles for select to authenticated using (true);
create policy profiles_self_update on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and global_role = (select global_role from profiles p where p.id = auth.uid()));
create policy profiles_admin on profiles for all to authenticated using (is_admin()) with check (is_admin());

create policy scopes_select on staff_scopes for select to authenticated
  using (user_id = auth.uid() or is_admin() or can_access_division(division_id, 'edit'));
create policy scopes_admin on staff_scopes for all to authenticated
  using (is_admin() or (my_role() = 'director')) with check (is_admin() or (my_role() = 'director'));

-- Attendance: read within scope; inserts only through record_attendance().
create policy attendance_select on attendance_events for select to authenticated
  using (can_access_camper(camper_id, 'view'));
-- (no insert/update/delete policies: the RPC is security definer)

-- Buzzers
create policy buzzers_read  on buzzers for select to authenticated using (true);
create policy buzzers_admin on buzzers for all to authenticated using (is_admin()) with check (is_admin());
create policy ba_select on buzzer_assignments for select to authenticated using (can_access_camper(camper_id, 'view'));
create policy pr_select on page_requests for select to authenticated
  using (exists (select 1 from buzzer_assignments a where a.id = assignment_id and can_access_camper(a.camper_id, 'view')));
-- writes via assign_buzzer()/release_buzzer()/request_page() RPCs; the bridge uses the service role.

-- Imports: admins only (directors may view).
create policy imports_admin on imports for all to authenticated using (is_admin()) with check (is_admin());
create policy imports_director_read on imports for select to authenticated using (my_role() = 'director');
create policy import_rows_admin on import_rows for all to authenticated using (is_admin()) with check (is_admin());
create policy mappings_admin on import_mappings for all to authenticated using (is_admin()) with check (is_admin());

-- Print jobs: requester, office, admins.
create policy print_jobs_select on print_jobs for select to authenticated
  using (requested_by = auth.uid() or my_role() in ('owner','admin','director','office','logistics'));
create policy print_jobs_insert on print_jobs for insert to authenticated with check (requested_by = auth.uid());
create policy print_jobs_office_update on print_jobs for update to authenticated
  using (my_role() in ('owner','admin','director','office')) with check (true);
create policy print_items_select on print_job_items for select to authenticated
  using (exists (select 1 from print_jobs j where j.id = job_id
                 and (j.requested_by = auth.uid() or my_role() in ('owner','admin','director','office','logistics'))));
create policy print_items_insert on print_job_items for insert to authenticated
  with check (can_access_camper(camper_id, 'scan'));

-- Audit: admins and directors; a camper's history is exposed through a function that re-checks scope.
create policy audit_admin on audit_log for select to authenticated using (my_role() in ('owner','admin','director'));

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Validated attendance transition. Returns the new event.
create or replace function record_attendance(
  p_camper_id uuid,
  p_event_type attendance_event_type,
  p_method attendance_method default 'manual',
  p_note text default null,
  p_occurred_at timestamptz default now(),
  p_force_status camper_status default null,   -- only for 'correction'
  p_device_label text default null
) returns attendance_events
language plpgsql security definer set search_path = public as $$
declare
  cur camper_status; nxt camper_status; ev attendance_events;
begin
  if not can_access_camper(p_camper_id, 'scan') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select status into cur from campers where id = p_camper_id for update;
  if cur is null then raise exception 'camper not found'; end if;

  nxt := case p_event_type
    when 'arrival'  then case when cur in ('expected','departed','no_show') then 'present'::camper_status end
    when 'leave'    then case when cur = 'present' then 'out'::camper_status end
    when 'return'   then case when cur = 'out' then 'present'::camper_status end
    when 'pickup'   then case when cur in ('present','out') then 'departed'::camper_status end
    when 'no_show'  then case when cur = 'expected' then 'no_show'::camper_status end
    when 'correction' then p_force_status
  end;
  if nxt is null then
    raise exception 'invalid transition % from %', p_event_type, cur using errcode = 'P0001';
  end if;
  if p_event_type = 'correction' and not (is_admin() or my_role() = 'director') then
    raise exception 'corrections require director/admin' using errcode = '42501';
  end if;
  if p_event_type = 'correction' and coalesce(p_note, '') = '' then
    raise exception 'corrections require a note';
  end if;

  insert into attendance_events (camper_id, event_type, method, occurred_at, recorded_by, note, resulting_status, device_label)
  values (p_camper_id, p_event_type, p_method, p_occurred_at, auth.uid(), p_note, nxt, p_device_label)
  returning * into ev;

  update campers set status = nxt, last_event_id = ev.id where id = p_camper_id;

  -- a final pickup releases the buzzer automatically
  if nxt = 'departed' then
    update buzzer_assignments set released_at = now(), released_by = auth.uid()
      where camper_id = p_camper_id and released_at is null;
    update campers set current_buzzer_number = null where id = p_camper_id;
  end if;
  return ev;
end $$;

create or replace function assign_buzzer(p_camper_id uuid, p_number int) returns buzzer_assignments
language plpgsql security definer set search_path = public as $$
declare a buzzer_assignments; sid uuid;
begin
  if not can_access_camper(p_camper_id, 'scan') then raise exception 'not allowed' using errcode='42501'; end if;
  select session_id into sid from campers where id = p_camper_id;
  insert into buzzers (session_id, number) values (sid, p_number) on conflict do nothing;
  -- release anything already open for this camper
  update buzzer_assignments set released_at = now(), released_by = auth.uid()
    where camper_id = p_camper_id and released_at is null;
  insert into buzzer_assignments (camper_id, session_id, buzzer_number, assigned_by)
    values (p_camper_id, sid, p_number, auth.uid()) returning * into a;
  update campers set current_buzzer_number = p_number where id = p_camper_id;
  return a;
end $$;

create or replace function release_buzzer(p_camper_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not can_access_camper(p_camper_id, 'scan') then raise exception 'not allowed' using errcode='42501'; end if;
  update buzzer_assignments set released_at = now(), released_by = auth.uid()
    where camper_id = p_camper_id and released_at is null;
  update campers set current_buzzer_number = null where id = p_camper_id;
end $$;

create or replace function request_page(p_camper_id uuid) returns page_requests
language plpgsql security definer set search_path = public as $$
declare a buzzer_assignments; r page_requests; mode text;
begin
  if not can_access_camper(p_camper_id, 'scan') then raise exception 'not allowed' using errcode='42501'; end if;
  select * into a from buzzer_assignments where camper_id = p_camper_id and released_at is null;
  if a is null then raise exception 'no buzzer assigned'; end if;
  select value->>'mode' into mode from settings where key = 'pager';
  insert into page_requests (assignment_id, buzzer_number, requested_by, status)
    values (a.id, a.buzzer_number, auth.uid(), case when mode = 'bridge' then 'queued'::page_status else 'manual'::page_status end)
    returning * into r;
  return r;
end $$;

-- Fuzzy, scope-filtered camper search.
create or replace function search_campers(p_session_id uuid, p_q text, p_limit int default 20)
returns table (id uuid, camper_code text, display_name text, division_id uuid, bunk_id uuid, status camper_status, score real)
language sql stable security invoker as $$
  with q as (select normalize_name(p_q) as nq, regexp_replace(p_q, '\D', '', 'g') as digits)
  select c.id, c.camper_code, c.display_name, c.division_id, c.bunk_id, c.status,
         greatest(
           similarity(c.name_normalized, q.nq),
           case when c.name_normalized like q.nq || '%' then 0.9 else 0 end,
           case when q.digits <> '' and c.camper_code like q.digits || '%' then 1.0 else 0 end,
           case when q.digits <> '' and exists (select 1 from camper_contacts k where k.camper_id = c.id and k.phone_e164 like '%' || q.digits) then 0.95 else 0 end
         ) as score
  from campers c, q
  where c.session_id = p_session_id and c.archived_at is null
    and ( c.name_normalized % q.nq
          or c.name_normalized like q.nq || '%'
          or (q.digits <> '' and (c.camper_code like q.digits || '%'
               or exists (select 1 from camper_contacts k where k.camper_id = c.id and k.phone_e164 like '%' || q.digits))) )
  order by score desc, c.last_name, c.first_name
  limit p_limit
$$;

-- Camper timeline for the detail page (re-checks scope; audit_log itself is admin-only).
create or replace function camper_history(p_camper_id uuid)
returns table (at timestamptz, actor_id uuid, source text, action text, diff jsonb)
language sql stable security definer set search_path = public as $$
  select a.at, a.actor_id, a.source, a.action, a.diff
  from audit_log a
  where a.table_name in ('campers','camper_contacts')
    and (a.row_id = p_camper_id or (a.after->>'camper_id')::uuid = p_camper_id or (a.before->>'camper_id')::uuid = p_camper_id)
    and can_access_camper(p_camper_id, 'view')
  order by a.at desc
$$;

-- ---------------------------------------------------------------------------
-- Storage buckets (private)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('imports', 'imports', false),
  ('templates', 'templates', false),
  ('print-output', 'print-output', false)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Default settings
-- ---------------------------------------------------------------------------
insert into settings (key, value) values
  ('office_email', '{"to": "", "cc": []}'),
  ('pager',        '{"mode": "manual"}'),                -- 'manual' | 'bridge'
  ('scan',         '{"arrivalAutoConfirm": true, "undoSeconds": 6, "soundOn": true}'),
  ('import',       '{"missingThresholdPct": 20}')        -- warn if > 20% of a division vanishes
on conflict do nothing;
