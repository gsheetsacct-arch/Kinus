# 3. Roles, areas and permissions

Every person has two things, set on one form (or for many people at once):

1. **A role**: decides what they can do and which details they see.
2. **Where**: all of camp, or any mix of division groups, divisions and bunks; decides
   which campers.

What each role can do is set in one place, **Roles** (Setup → Roles, directors over all
of camp): per role, *view only*, *check in & out* or *edit details*, and which sensitive
details it sees. Changing a role there changes everyone with it (`role_access`, migration
0021; a trigger keeps `profiles.access_level` equal to the role's level). People don't
have a level of their own any more. Starting levels:

| Role | Level | Notes |
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
  change role and where (replace or add), email sign-in links, deactivate, or delete.

## Deleting someone
Deactivating stops someone signing in and can be undone. **Delete** (their page, or
tick people on the list; type "delete" to confirm) removes the account for good.
What they recorded stays: check-ins, print requests and imports keep their place in the
history with "who" left empty ("a deleted staff account"). Whoever may change a person
may delete them; Kinus always keeps at least one owner.

## Sensitive details
Roles → *Sees* turns on, per role, contacts, medical details, notes from parents, local
address and staff notes, always only for campers in their own area. Everyone else sees a
yes/no medical flag.

## Enforcement
- Postgres RLS: `area_covers()`, `can_access_camper()`, `can_access_division()`,
  `can_view_field_group()`, `is_admin()` (owner, or director over all of camp).
- Server actions check `canManageRole()` / `canGrantAreas()` before any staff change.
- The `profiles_guard` trigger stops anyone but camp-wide directors (and the server)
  changing roles, levels, areas or active state.

## Staff phone book

Everyone has **Phone book** (More → Phone book). Head counselors, division heads, directors, the
owner, office and logistics see the staff of each division they look after — head staff first, then
counselors by bunk, then check-in helpers — plus the directors and office over all of camp, with call,
text and email buttons. Counselors and check-in helpers see just their head counselors and division head. Phone numbers come from each person's
Account page (or a director on the Staff page).

## Who manages staff

The **Staff** page (add, edit, deactivate, send sign-in links, add many at once) is open to:

| Manager | May add and change | Where |
|---|---|---|
| Owner / director over all of camp | everyone (owners only by an owner) | anywhere |
| Director of a camp or divisions | anyone below director | inside their camp/divisions |
| Division head | head counselors, counselors, check-in helpers | inside their divisions |
| Head counselor | counselors, check-in helpers | inside their divisions |

Division heads and head counselors never give "all of camp", and can't
move someone who works in another division (a director does that). Each person also has a free-text
**position** ("Learning head", "Waterfront") shown in the phone book; it doesn't change what they can do.
