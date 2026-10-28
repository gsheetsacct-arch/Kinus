# 3. Roles, areas and permissions

Every person has two things, set on one form (or for many people at once):

1. **A role**: decides what they can do and which details they see.
2. **Where**: all of camp, or any mix of division groups, divisions and bunks; decides
   which campers.

What each role can do is set in one place, **Roles** (Setup → Roles, directors over all
of camp): per role, *view only*, *check in & out* or *edit details*, and which sensitive
details it sees. Changing a role there changes everyone with it (`role_access`, migration
0021; a trigger keeps `profiles.access_level` equal to the role's level). People don't
have a level of their own any more.

A role the camp doesn't use can be removed there once nobody has it (`role_access.enabled`,
migration 0027): it stops being offered when adding or changing staff, in bulk upload and
its template, and (for Check-in helper) for check-in logins. The server refuses it too.
Removed roles are listed at the bottom of the page to bring back. Owner and Director
always stay.

When adding or changing a person, *Where* is asked the way the role needs it: a counselor
picks a division, then their bunk; head counselors, division heads and check-in helpers
pick divisions; directors, office and logistics pick all of camp or a camp. "Pick exactly"
opens the full tree for any mix. Starting levels:

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

Areas belong to one session. A new session started without "copy staff" would leave
everyone's areas in the last one, and they'd see no campers (only the owner and all-of-camp
people would). So a person whose areas are **all** in earlier sessions gets the same
places in the active session, by name: camp by camp name, division by division name, bunk
by division and bunk name (`lib/staff/carry-areas.ts`). Never more than they had: a bunk
or division that isn't in the new session isn't carried. It runs when a session is made
active, after an import, when the Staff page opens, and when such a person signs in.
Someone who already has any area in the active session is left alone, so areas changed or
taken away there stay as they are.

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

## Signing in (`profiles.login`, migration 0022)
- **Signs in** (`personal`): their own email, with a link, password or Face ID.
- **Listed only** (`none`): most counselors. They're in the phone book and on their bunk's
  lists (name and phone under the bunk heading) so head staff can reach them, but they
  never sign in: no email needed, their Supabase sign-in is blocked (banned), and the app
  refuses them too. New counselors default to this; bulk upload has an optional *Signs in*
  column (yes/no).
- **Check-in login** (`shared`): as many per division as it needs (one per gate or per
  phone), created on the Staff page (*Check-in logins*) by directors, division heads and
  head counselors for their divisions. Whoever creates one is asked first: *Make them up
  for me* (name `division-1`, `division-1-2`… and an easy-to-type password) or *I'll type
  my own*; *New password* asks the same, the bin removes it (its check-ins stay). A
  check-in login only gets Check in, Who's here, Not here yet, Campers and Phone book:
  no Home, Lists, Print or account settings (`CurrentUser.checkinLogin`, `buildNav`).
  It checks out "coming back" only; going home is Final check-out.
  **Final check-out** (a switch on each login, turned on by the division head or head
  counselor of the login's division, or a director) adds the Final check-out page, where the login finds and checks out (going home)
  every camper of its camp; everything else stays its own division (05 §5.1a).
  Check-in helpers who sign in with their own email also get Not here yet.
  Head staff and directors check in with their own accounts.

Anyone who can check in more than one division picks **which line they're at** on Check in
(remembered for the shift). A camper from another division then asks "Not your line"
before anything is recorded.

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

### Who edits templates

Directors over all of camp (and owners) make and change the print templates, label fields and
conversions. They can also allow anyone else with their own sign-in to do so: **Print →
Templates → Who can edit templates**. That's kept in settings (`template_designers`, a list of
people), not a role, so it needs no database change and nothing else about the person changes.
Allowed people get Templates and Fields & conversions (a "Tag designs" menu item if they don't
otherwise print) and the editor's previews, which show real campers of their own area. Their
changes are written with the server's key after that check (`lib/print/designers.ts`); the
database itself still lets only directors over all of camp change templates.

## Text updates sign-up (`/updates`, migration 0038)
A public page, no account needed: staff give their name and cell number and tick a box to
agree to text updates from the directors. Each sign-up keeps the exact words agreed to, when,
and from where (`update_signups`, one row per number: signing up again renews it). Only the
server reads and writes the table. Directors see the list, the link and a QR code to post
under Staff → Updates sign-ups, download it as Excel or CSV, and take people off it. A hidden
field and a limit per address (30 an hour) keep scripts out.

## Text staff (`/messages`, migration 0039)
Texts to staff through Twilio (setup: 09 §9.5b).

| Sender | May text |
|---|---|
| Owner / director over all of camp | Everyone (all staff, directors and office, and the `/updates` sign-ups), or any divisions |
| Director of a camp or divisions | The staff of their divisions |
| Division head, head counselor | The staff of their divisions |

A division's staff are the active people whose *Where* covers it (a bunk, the division, or its camp),
check-in logins excepted. Directors and office over all of camp only get "everyone" texts. Each number
gets one text even if the person is in several chosen divisions. Before sending, the page shows who it
goes to and who it can't reach (no phone number, or replied STOP). Directors over all of camp see every
text sent; others see their own and those sent to their divisions, with each person's delivery status.
