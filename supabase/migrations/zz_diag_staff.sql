-- read-only: staff whose name looks like the one asked for
\pset footer off
select full_name, role, title, is_active, login from profiles where full_name ilike '%scha%f%' or full_name ilike '%shaf%' or full_name ilike '%levik%' order by full_name;
