-- =============================================================================
-- Kinus — 0038: staff sign up for text updates (the public page /updates)
--   * update_signups: who asked for updates from the directors, at which number, and the exact
--     consent they gave (its words, when, from where). One row per phone number: signing up
--     again updates the name and renews the consent.
--   * Written and read only by the server (the page has no sign-in; directors see the list
--     under Staff → Updates sign-ups), so no one reaches it through the API directly.
-- =============================================================================

create table if not exists update_signups (
  id            uuid primary key default gen_random_uuid(),
  full_name     text not null,
  phone         text not null,              -- as typed
  phone_e164    text not null unique,       -- +17185550100
  consent_text  text not null,              -- the words they agreed to
  consented_at  timestamptz not null default now(),
  ip            text,
  user_agent    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table update_signups is 'Staff who signed up for text updates from the directors (/updates), with their consent.';
create index if not exists update_signups_ip_idx on update_signups (ip, updated_at);

alter table update_signups enable row level security;
revoke all on update_signups from anon, authenticated;
grant select, insert, update, delete on update_signups to service_role;
