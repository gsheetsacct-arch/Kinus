-- =============================================================================
-- Kinus — 0064: final check-out's "called" list
--   * checkout_calls: a camper whose name was tapped on Final check-out (their parent is here,
--     so they're called to come). Shared by every final check-out phone; taken off with
--     "Not called". Being checked out (a scan) is what sends them home; called is only a list.
--   * Read and written by the server only (the final check-out actions check the camp).
-- =============================================================================

create table if not exists checkout_calls (
  camper_id  uuid primary key references campers(id) on delete cascade,
  session_id uuid not null references sessions(id) on delete cascade,
  called_at  timestamptz not null default now(),
  called_by  uuid references profiles(id) on delete set null
);
create index if not exists checkout_calls_session on checkout_calls(session_id, called_at desc);
alter table checkout_calls enable row level security;
revoke all on checkout_calls from anon, authenticated;
