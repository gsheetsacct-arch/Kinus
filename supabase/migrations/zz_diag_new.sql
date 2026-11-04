\pset pager off
select file_name, status, uploaded_at, applied_at, summary->>'added' as added, summary->>'updated' as updated from imports order by uploaded_at desc limit 2;
-- staff: what changed today after 19:30 UTC
select a.action, coalesce(a.after->>'full_name', a.before->>'full_name') as name, a.after->>'source_id' as id, a.before->>'role' as was_role, a.after->>'role' as role, a.at
from audit_log a where a.table_name = 'profiles' and a.at > now() - interval '45 minutes' order by a.at limit 60;
select count(*) as staff_scope_changes from audit_log where table_name = 'staff_scopes' and at > now() - interval '45 minutes';
