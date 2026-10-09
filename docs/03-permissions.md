# 3. Roles, areas and permissions

Every person has three things, set on one form (or for many people at once):

1. **A role**: what they are.
2. **Where**: all of camp, or any mix of division groups, divisions and bunks.
3. **What they can do there**: view only, check in & out, or edit details.
   Pre-filled from the role; can be changed per person.

| Role | Usual level | Notes |
|---|---|---|
| Owner | edit | Everything, everywhere, including other owners. |
| Director | edit | Over all of camp: also imports, sessions, divisions, settings, templates. Over an area: campers, staff and corrections in that area. |
| Division head | edit | Most detailed lists. |
| Head counselor | check in & out | Sees medical details by default. |
| Counselor | check in & out | Bunk list. |
| Check-in helper | check in & out | Only helps with check-in/out. |
| Office | view | Contacts and printing. |
| Logistics | check in & out | Buses and pickup. |

## Division groups
Divisions can be grouped (for example *Main camp* = Division 1, 2, 3 and the Bar
Mitzvah Program, with Hebrew and French separate). Giving someone a group covers
every division in it, including divisions added to the group later.

## Who can manage whom
- Owners manage anyone. Directors over all of camp manage anyone except owners.
- Directors over an area add and change people below director, and only within their
  own area. They can't give "all of camp".
- Nobody changes their own role or area.

## Bulk
- **Add many at once**: paste rows from a spreadsheet (name, email, role, division or
  group, bunk) or upload CSV/XLSX; the preview flags typos with suggestions; new
  people get invitation emails (or starting passwords to hand out).
- **Staff list**: search, filter by role / where / status, sort, tick people, and
  change role, where (replace or add) and level, email sign-in links, or deactivate.

## Sensitive details
Settings → *Who can see sensitive details* ticks, per role, who also sees contacts,
medical details, notes from parents, local address and staff notes, always only for
campers in their own area. Everyone else sees a yes/no medical flag.

## Enforcement
- Postgres RLS: `area_covers()`, `can_access_camper()`, `can_access_division()`,
  `can_view_field_group()`, `is_admin()` (owner, or director over all of camp).
- Server actions check `canManageRole()` / `canGrantAreas()` before any staff change.
- The `profiles_guard` trigger stops anyone but camp-wide directors (and the server)
  changing roles, levels, areas or active state.
