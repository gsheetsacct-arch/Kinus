-- =============================================================================
-- Kinus — 0048: head counts
--   A roll call that changes no one's check-in: a bus ride, a trip, a fire drill. Head staff
--   start one for some divisions (and, for more than one bus, name the buses); whoever scans
--   picks their bus and scans tags. Everyone checked in in those divisions is expected; the
--   count shows who's been counted, on which bus, and who's still missing.
--   * head_counts: the count: its name, divisions, buses, who started it, and when it closed.
--   * head_count_marks: a camper counted (once per count; scanned again on another bus moves
--     them there).
--   * Written and read only by the server, after it checks who may see and count (like the
--     text tables), so no one reaches them through the API directly.
-- =============================================================================

create table if not exists head_counts (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid references sessions(id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 120),
  division_ids     uuid[] not null,
  groups           text[] not null default '{}',   -- the buses; empty = just one
  created_by       uuid references profiles(id) on delete set null,
  created_by_name  text not null,
  created_at       timestamptz not null default now(),
  closed_at        timestamptz,
  closed_by_name   text
);
comment on table head_counts is 'Roll calls (bus rides, trips): who has been counted, without changing check-in.';
create index if not exists head_counts_session_idx on head_counts (session_id, created_at desc);

create table if not exists head_count_marks (
  head_count_id   uuid not null references head_counts(id) on delete cascade,
  camper_id       uuid not null references campers(id) on delete cascade,
  group_name      text,
  method          text not null default 'scan' check (method in ('scan', 'manual')),
  marked_by       uuid references profiles(id) on delete set null,
  marked_by_name  text,
  marked_at       timestamptz not null default now(),
  primary key (head_count_id, camper_id)
);

alter table head_counts enable row level security;
alter table head_count_marks enable row level security;
revoke all on head_counts, head_count_marks from anon, authenticated;
grant select, insert, update, delete on head_counts, head_count_marks to service_role;
