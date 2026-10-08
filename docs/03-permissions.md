# 3. Roles, scopes and permissions

## 3.1 Two axes: who you are globally, and where you are scoped

Access is the union of:

1. **A global role** on the person's profile (one per person).
2. **Zero or more scopes**: rows of `user × division × (bunk | all bunks) × scope role × access level`.

A counselor has global role `staff` and one scope (their bunk, `counselor`, `scan`).
A head counselor has global role `staff` and one scope (their division, all bunks,
`head_counselor`, `scan` or `edit`). A division head is the same with `division_head`.
The owner has global role `owner` and no scopes. One person may have several scopes
(e.g. head counselor in French, plain scanner in Hebrew), which the admin sets on the
user's page.

### Global roles

| Role | Implicit level everywhere | Can also |
|---|---|---|
| `owner` | edit | Everything, including managing admins and billing-level settings. Cannot be removed by an admin. |
| `admin` | edit | Imports, users & scopes, divisions/bunks, templates, presets, settings. |
| `director` | edit | Corrections to attendance, bulk no-show, grant/revoke scopes, view imports. No user management. |
| `logistics` | scan | Scan anywhere, see every camper's status and contacts, buzzer handout/paging, print requests. |
| `office` | view | Print queue (mark printed, re-send), see contacts for the whole roster. Cannot scan. |
| `staff` | none | Only what their scopes grant. |

### Scope roles and access levels

The scope role says *what they are* (used for list presets and field visibility).
The access level says *what they may do* in that scope:

| Level | Grants |
|---|---|
| `view` | See campers in scope, their status, who checked them in/out, contact phones (per field visibility). |
| `scan` | `view` + check in / out / return / pickup, assign and page buzzers, request tags. |
| `edit` | `scan` + edit camper details and staff notes, move campers between bunks within the division, add manual contacts. |

Defaults when an admin creates a scope: counselor → `scan`, head counselor → `scan`,
division head → `edit`, scanner (a helper who only checks in) → `scan`. The admin can
change the level per row, which answers "what level of access, just scan in/out or
update info".

## 3.2 Field visibility (column-level)

Row Level Security answers "which campers". Sensitive *columns* are handled by
field groups in the `field_visibility` table, editable by admins in Settings:

| Group | Fields | Default: global roles | Default: scope roles |
|---|---|---|---|
| `contacts` | parent/emergency names, phones, emails | owner, admin, director, logistics, office | division_head, head_counselor, counselor |
| `medical` | medical notes, allergies text, EpiPen/meds/allergies flags | owner, admin, director | division_head, head_counselor |
| `parent_notes` | "anything else we should know" | owner, admin, director | division_head, head_counselor |
| `address` | local address + cross streets | owner, admin, director, logistics | division_head, head_counselor |
| `staff_notes` | notes staff wrote in-app | owner, admin, director, logistics | division_head, head_counselor, counselor |

Everyone who can see a camper also sees `has_medical_flag` (a single yes/no), so a
counselor knows to ask the head counselor without seeing the details.

Implementation: the app reads campers through the `campers_visible` view, which nulls
masked columns per row using `can_view_field_group()`. Lists and exports read the
same view, so a counselor cannot export what they cannot see. Contacts are a separate
table with their own policy.

## 3.3 Permission matrix (summary)

| Capability | owner/admin | director | logistics | office | division head | head counselor | counselor |
|---|---|---|---|---|---|---|---|
| See status board | all | all | all | all | division | division | bunk |
| Check in / out / return / pickup | ✔ | ✔ | ✔ | – | division | division | bunk |
| Correct attendance (any → any) | ✔ | ✔ | – | – | – | – | – |
| Bulk no-show at end | ✔ | ✔ | – | – | – | – | – |
| Edit camper details | ✔ | ✔ | – | – | division (if `edit`) | if `edit` | – |
| Move camper between bunks | ✔ | ✔ | – | – | within division | if `edit` | – |
| See contacts | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| See medical details | ✔ | ✔ | flag only | flag only | ✔ | ✔ | flag only |
| Request name/luggage tag | ✔ | ✔ | ✔ | ✔ (batch) | ✔ | ✔ | ✔ |
| Print queue: mark printed, re-send | ✔ | ✔ | – | ✔ | – | – | – |
| Buzzer handout / lookup / page | ✔ | ✔ | ✔ | lookup | ✔ | ✔ | bunk |
| Lists (bunk/HC/DH) | all presets | all presets | all | all | DH preset, division | HC preset, division | counselor preset, bunk |
| Upload import, apply | ✔ | view only | – | – | – | – | – |
| Manage users and scopes | ✔ | scopes only | – | – | – | – | – |
| Divisions/bunks, templates, presets, settings | ✔ | – | – | – | – | – | – |

## 3.4 Enforcement layers

1. **Postgres RLS** on every table (policies in the migration). `can_access_camper()`
   and `can_access_division()` are the single source of truth. All server-side reads
   use a client bound to the user's JWT so RLS applies even to server components.
2. **RPCs** (`record_attendance`, `assign_buzzer`, `request_page`, `apply_import`)
   re-check permission at the top and run as `security definer` so they can write
   tables the user has no direct write policy on.
3. **UI** hides what the user cannot do (derived from the same scope rows, fetched
   once at login into a `Permissions` context), so counselors never see an import
   button they'd be refused on.
4. **Service role** is used only by: import apply (writes campers in bulk), the print
   worker (reads all job data, writes PDFs), the email sender, the pager bridge, and
   the audit trigger. These run in server code with the actor recorded explicitly.

## 3.5 Account lifecycle

- Admin creates a user: name, email, global role, scopes. Supabase sends the invite
  (custom template through Resend) with a magic link; the user sets a password or
  keeps using magic links.
- Deactivating (`is_active = false`) revokes all access immediately (`my_role()`
  returns `staff` and scopes are ignored via the `is_active` join).
- Sessions: the JWT lifetime is 1 hour with refresh; staff phones stay logged in for
  the whole program. Admins can "sign out everywhere" from the user page
  (Supabase `admin.signOut`).
- Shared devices (an office laptop): a "kiosk" scan page is **not** planned; each
  staff member logs in so every event has a real `recorded_by`.
