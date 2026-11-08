-- =============================================================================
-- Kinus — 0069: final check-outs set up by directors (Final check-out → Set up)
--   The settings row "final_checkouts" lists them: each has its camps (division_groups ids,
--   one or more) and who may use it ("all", or a list of roles and "checkin_login" for the
--   shared check-in phones). Anyone it's for who works in one of its camps may record "gone
--   home" for any camper of all its camps (lib/checkout/setups, the same rule).
--   * my_checkout_divisions: those divisions, as well as (as in 0029) every division of their
--     own camp for a login or check-in helper given final check-out on its own.
--   * can_final_checkout: a camper in those divisions. The check-in level is still needed for
--     the one-by-one switch (as before); a set-up check-out is for whoever the director chose.
-- Safe to run again.
-- =============================================================================

create or replace function my_checkout_divisions() returns uuid[]
language sql stable security definer set search_path = public as $$
  with me as (
    select p.role::text as role, p.login, p.final_checkout from profiles p where p.id = auth.uid() and p.is_active
  ),
  my_camps as (
    select d2.group_id from divisions d2 where d2.id = any (my_whole_divisions())
    union
    select d3.group_id from bunks b join divisions d3 on d3.id = b.division_id where b.id = any (my_bunks())
  ),
  setups as (
    select e from settings s
    cross join lateral jsonb_array_elements(case when jsonb_typeof(s.value) = 'array' then s.value else '[]'::jsonb end) e
    where s.key = 'final_checkouts' and jsonb_typeof(e) = 'object' and jsonb_typeof(e->'camps') = 'array'
  ),
  -- the set-up check-outs for this account (its kind, and a camp it works in): all their camps
  set_up as (
    select c.value as gid
    from setups, me, jsonb_array_elements_text(setups.e->'camps') c
    where (setups.e->>'who' = 'all'
           or (jsonb_typeof(setups.e->'who') = 'array'
               and case when me.login = 'shared' then (setups.e->'who') ? 'checkin_login' else (setups.e->'who') ? me.role end))
      and exists (
        select 1 from jsonb_array_elements_text(setups.e->'camps') c2
        where c2.value in (select group_id::text from my_camps)
      )
  ),
  -- final check-out turned on for this login or helper alone: its own camp (0029), with the check-in level
  own as (
    select group_id::text as gid from my_camps, me where me.final_checkout and my_level_rank() >= 2
  )
  select coalesce(array_agg(d.id), '{}') from divisions d
  where d.group_id::text in (select gid from set_up union select gid from own)
$$;

create or replace function can_final_checkout(p_camper_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from campers c where c.id = p_camper_id and c.division_id = any (my_checkout_divisions()))
$$;
