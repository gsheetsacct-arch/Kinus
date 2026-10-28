-- =============================================================================
-- Kinus — 0039: text messages to staff, sent through Twilio (Text staff, /messages)
--   * text_broadcasts: one message sent to many staff: who sent it, what it said, and to which
--     divisions (division_ids empty = everyone, which only directors over all of camp send).
--   * text_broadcast_recipients: each number it went to, with Twilio's message id and the
--     delivery status Twilio reports back (queued → sent → delivered, or failed/undelivered).
--   * text_opt_outs: numbers that replied STOP (taken off again by START). Never texted while here.
--   * Written and read only by the server, after it checks who may send to whom (like
--     update_signups), so no one reaches them through the API directly.
-- =============================================================================

create table if not exists text_broadcasts (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid references sessions(id) on delete set null,
  sent_by       uuid references profiles(id) on delete set null,
  sender_name   text not null,
  body          text not null check (char_length(body) between 1 and 1600),
  division_ids  uuid[] not null default '{}',   -- empty = everyone
  audience      text not null,                   -- as shown: "Everyone", "Division 1, Division 2"
  recipient_count int not null default 0,
  failed_count  int not null default 0,
  created_at    timestamptz not null default now()
);
comment on table text_broadcasts is 'Text messages sent to staff through Twilio (Text staff).';
create index if not exists text_broadcasts_created_idx on text_broadcasts (created_at desc);

create table if not exists text_broadcast_recipients (
  id            uuid primary key default gen_random_uuid(),
  broadcast_id  uuid not null references text_broadcasts(id) on delete cascade,
  profile_id    uuid references profiles(id) on delete set null,
  name          text not null,
  phone_e164    text not null,
  twilio_sid    text unique,
  status        text not null default 'queued',  -- queued, sent, delivered, undelivered, failed
  error_code    text,
  error_message text,
  updated_at    timestamptz not null default now(),
  unique (broadcast_id, phone_e164)
);
create index if not exists text_broadcast_recipients_broadcast_idx on text_broadcast_recipients (broadcast_id);

create table if not exists text_opt_outs (
  phone_e164    text primary key,
  opted_out_at  timestamptz not null default now()
);
comment on table text_opt_outs is 'Numbers that replied STOP to a staff text. Removed when they reply START.';

alter table text_broadcasts enable row level security;
alter table text_broadcast_recipients enable row level security;
alter table text_opt_outs enable row level security;
revoke all on text_broadcasts, text_broadcast_recipients, text_opt_outs from anon, authenticated;
grant select, insert, update, delete on text_broadcasts, text_broadcast_recipients, text_opt_outs to service_role;
