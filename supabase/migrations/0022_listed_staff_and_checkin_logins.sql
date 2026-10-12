-- =============================================================================
-- Kinus — 0022: how someone signs in.
--   personal  their own email (and password, link or Face ID), as before
--   shared    a check-in login for a division: a short name and a password that the
--             check-in phones of that division share
--   none      listed only (most counselors): in the phone book and on the bunk, so head
--             staff can reach them, but they can't sign in (their sign-in is blocked)
-- =============================================================================
alter table profiles add column if not exists login text not null default 'personal';
alter table profiles drop constraint if exists profiles_login_kind;
alter table profiles add constraint profiles_login_kind check (login in ('personal', 'shared', 'none'));
grant select (login) on profiles to authenticated;
