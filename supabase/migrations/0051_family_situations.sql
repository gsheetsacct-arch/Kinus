-- A detail group for sensitive family information (custody, a hard time at home): an added
-- column can be put in it (Settings → Added columns → Who sees this), and Staff → Roles says
-- which roles see it. Owners and directors to start with.
insert into field_visibility (field_group, roles) values ('family', '{owner,director}')
on conflict (field_group) do nothing;
