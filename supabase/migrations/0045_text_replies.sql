-- =============================================================================
-- Kinus — 0045: replies to staff texts
--   * text_replies: what people text back to the camp number (anything but STOP / START /
--     HELP, which Twilio handles), kept with the text it answers: the latest text sent to that
--     number in the week before. Shown under that text on Text staff; replies to nothing are
--     shown to directors over all of camp.
--   * Written and read only by the server, like the other text tables (0039).
-- =============================================================================

create table if not exists text_replies (
  id            uuid primary key default gen_random_uuid(),
  broadcast_id  uuid references text_broadcasts(id) on delete set null,
  profile_id    uuid references profiles(id) on delete set null,
  name          text,
  phone_e164    text not null,
  body          text not null,
  twilio_sid    text unique,
  received_at   timestamptz not null default now()
);
comment on table text_replies is 'Texts people send back to the camp number, with the staff text they answer.';
create index if not exists text_replies_broadcast_idx on text_replies (broadcast_id, received_at);
create index if not exists text_replies_received_idx on text_replies (received_at desc);

alter table text_replies enable row level security;
revoke all on text_replies from anon, authenticated;
grant select, insert, update, delete on text_replies to service_role;
