-- =============================================================================
-- Kinus — 0050: a camper's Changes tab, fast
--   camper_history looked for "this camper's row, or a contact row naming this camper" in one
--   OR, which no index can answer: every camper change in the audit log (each import writes
--   one per camper, with the whole row) was unpacked on every camper page. Now three lookups
--   that use indexes: the camper's own rows (audit_log_row), and their contacts' rows by the
--   camper named before and after the change (two new partial indexes).
-- =============================================================================
create index if not exists audit_log_contact_after on audit_log (((after->>'camper_id')::uuid)) where table_name = 'camper_contacts';
create index if not exists audit_log_contact_before on audit_log (((before->>'camper_id')::uuid)) where table_name = 'camper_contacts';

create or replace function camper_history(p_camper_id uuid)
returns table (at timestamptz, actor_id uuid, source text, action text, diff jsonb)
language sql stable security definer set search_path = public as $$
  with mine as (
    select a.id from audit_log a where a.table_name = 'campers' and a.row_id = p_camper_id
    union
    select a.id from audit_log a where a.table_name = 'camper_contacts' and (a.after->>'camper_id')::uuid = p_camper_id
    union
    select a.id from audit_log a where a.table_name = 'camper_contacts' and (a.before->>'camper_id')::uuid = p_camper_id
  )
  select a.at, a.actor_id, a.source, a.action,
         (select coalesce(jsonb_object_agg(d.k, d.v), '{}'::jsonb)
            from jsonb_each(coalesce(a.diff, '{}'::jsonb)) as d(k, v)
           where d.k <> 'source_data'
             and case
                   when d.k in ('medical_notes','allergies','has_allergies','has_epipen','has_medications') then can_view_group('medical')
                   when d.k in ('local_address','local_address_cross_streets') then can_view_group('address')
                   when d.k = 'notes_from_parents' then can_view_group('parent_notes')
                   when d.k = 'staff_notes' then can_view_group('staff_notes')
                   else true
                 end) as diff
  from audit_log a
  join mine using (id)
  where (a.table_name <> 'camper_contacts' or can_view_group('contacts'))
    and can_access_camper(p_camper_id, 'view')
  order by a.at desc
$$;
