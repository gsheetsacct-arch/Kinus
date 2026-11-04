/**
 * The Kinus guide: how everything is set up and how to do each job, in one place. The Help
 * page shows it, and the Kinus connector gives it to the AI people use (kinus_guide), so the
 * AI can explain and walk someone through anything here. Plain Markdown (headings, lists,
 * tables, **bold**, `code`). Keep it true to how Kinus works: change it with the feature.
 */
export type GuideSection = { id: string; title: string; summary: string; body: string };

export const GUIDE: GuideSection[] = [
  {
    id: "start",
    title: "Kinus at a glance",
    summary: "What Kinus is, the yearly flow, and who can do what.",
    body: `
Kinus runs the Kinus: the campers (from the registration export), staff, check-in and check-out, lists, and everything printed (name tags, luggage tags, labels, badges).

> **How this guide works.** It says how Kinus works. Some things are **settings people choose** in Kinus (what each role may do and see, which columns are shown and to whom, the templates, the office email…): those are marked **⚙ Setting** with where they're set, and what's written there is only the usual starting point. **The actual choices made here are in "How it's set up now"**, read live from Kinus. When the two differ, "How it's set up now" is right.

### The flow of a season
1. **Set up the session** (Setup → Sessions): one per year or run. Everything (campers, divisions, print requests) belongs to the active session.
2. **Import the registration export** (Setup → Import roster). Kinus makes the divisions and bunks it finds, adds the campers and remembers how the columns were matched.
3. **Tidy the details**: divisions and bunks (names, order, colours, language), Hebrew names (Print → Hebrew names), who sees which columns (Setup → Roles / Settings).
4. **Add staff** (Staff → Add many at once, or the staff export) and give them roles and areas.
5. **Print ahead**: name badges, luggage tags, coat tags, packing labels (Print → Print a batch).
6. **Check-in day**: the check-in page (scan or type a name), Who's here, and labels printed on the spot.
7. **During the Kinus**: lists, head counts, texts to staff, follow-ups for campers who haven't arrived.
8. **Going home**: final check-out.

### Roles
Each person has a **role** (what they can do and which details they see) and **areas** (which campers: all of camp, a camp, a division or a bunk). A person's role and areas are set on Staff.

**⚙ Setting** (Setup → Roles): each role's level and which details it sees, and which roles are in use, are chosen here and can be changed any time. The table is only what the roles are meant for; for what each role actually may do and see now, see **How it's set up now**.

| Role | Meant for |
|---|---|
| Owner | Everything, everywhere. |
| Director | Runs camp or part of it; over all of camp also imports, settings, templates. |
| Division head | Runs a division: its campers, staff, check-in and its print queue. |
| Kloli / Head counselor / Counselor | Their division's or bunk's campers. |
| Office | The print queue and printing for their area. |
| Logistics | Printing (bus tags, labels) and lists for their area. |
| Scanner / check-in logins | Only check-in: the phones at a check-in line. |

The level of each role (view, check in & out, edit) and which kinds of detail it sees (contacts, medical, notes from parents, address, staff notes, family situations) are **⚙ settings** per role on **Setup → Roles**, and apply to everyone with that role at once.
`,
  },
  {
    id: "ai",
    title: "Using Kinus with your AI (Claude)",
    summary: "Connecting Claude to Kinus, and what to ask it.",
    body: `
Claude can work with Kinus directly through the **Kinus connector**: it can explain how anything here works (this whole guide), tell you how to prepare and upload a file, look things up, design and check label templates, fix Hebrew names and ask for prints, always as you and only with what your account may do.

### Connecting
- **Your organization already has the Kinus connector in Claude.** Open Claude → **Settings → Connectors**, click **Connect** next to Kinus, and sign in with your Kinus account. That's all.
- On Kinus the page **Connect your AI** has the connector's address and personal links (for Claude Code, or where you can't sign in).
- Disconnect any time on that page (Remove), or in Claude.

### Good things to ask
- "How should I prepare the staff list to upload?" / "What columns does the registration export need?"
- "I have a file with registration IDs and bus numbers: how do I add it?"
- "Why does this camper's tag say X?" / "Which campers have no Hebrew name yet?"
- "Make a luggage tag like the American one, for the French camp."
- "Queue the packing labels for Division 2, sorted by name."
- "How do I make a list for counselors with the T-shirt, sleeping and yarmulka in one column?"

Claude reads this guide with the **kinus_guide** tool, including **How it's set up now** (the live settings) for people who may see it; ask it to "read the Kinus guide on …" if it seems unsure.
`,
  },
  {
    id: "import",
    title: "Importing the registration export",
    summary: "Uploading the export, matching columns, reviewing changes, applying and undoing.",
    body: `
**Setup → Import roster → Upload a new export.** Upload the registration export (Excel .xlsx/.xls or CSV/TSV, up to 15 MB) whenever it changes. **Nothing is saved until you press Apply**, and the latest import can be undone.

### 1. Match the columns
Kinus remembers each kind of export (the main one, a separate program's) and matches the columns as last time. For each column choose:
- **A Kinus field**: first name, last name, registration ID (\`students.id\`: how campers are recognised next time; map the names, the ID, or both: with the ID, a row with no name still updates the camper with that ID, keeping their name, though a new camper needs a name), division, bunk, grade, T-shirt, medical, allergies, EpiPen, medications, notes from parents, address, parent and emergency contacts…
- **Show in Kinus**: every other column is kept with the camper and shown on the camper page, in lists and on labels (this is the default: every column is used unless you say otherwise).
- **Not needed**: left out, and stays out on later imports (bring it back in Settings → Extra fields → Left out).

Options on this step: **a separate program's export** (everyone in it goes into one division, with registration IDs of its own), **take bunks from the file**, **empty cells mean "don't know"** (keep what Kinus has: Kinus' fields and the export's other columns alike, so a file missing answers an earlier export had keeps them), and **our corrected copy** (see Protected columns).

**The Thursday Program.** The main export's Thursday columns (Thursday program yes/no, the Thursday group "Thursday Program - English / French / Hebrew", and Thursday bunks) put each camper with a Thursday group in it a second time: they stay in their regular division, and get a Thursday record in their Thursday division, in its own camp (**Thursday American**, **Thursday French**, **Thursday Hebrew**, made by the first import that has them, after the other camps). The Thursday record has its own registration ID (the same number, kept apart), its own check-in and tags, and gets only the templates that list its camp (the name badges list Thursday American, French and Hebrew: no luggage tags or packing labels), with the Thursday Program's badge picture. A camper whose group says Thursday but who answered No, or who answered Yes with no group yet, isn't put in, and the preview says so on their row. Dropping out of Thursday marks only the Thursday record "not in the latest export". **A file just for the Thursday bunks** (IDs, names and \`group_types.thursday_bunks\`, without the regular bunk columns) changes only the Thursday records: their bunks ("3" becomes Bunk 3, made in the Thursday division), never anyone's regular record, never empties a detail, and marks nobody missing; a row of someone with no Thursday record is left out.

### 2. Review
- **New**: campers added.
- **Updated**: what changes, grouped by field ("Bunk: 34 campers"), each camper old → new. The export's own columns are listed the same way ("Sleeping at the Kinus (export): 12 campers"). A camper whose only change is in those columns counts as updated.
- **Not in this export**: campers of the file's divisions who aren't in it; they're marked "not in the latest export" (not deleted). Walk-ins are never marked.
- **Conflicts**: rows Kinus can't match for sure (two campers with that name…): choose the camper or "add as new". Apply waits until there are none.

### 3. Apply, and undo
Apply makes the changes. **Undo** on the import (Import roster) takes the latest import back: added campers go (or are archived if they've checked in), changed fields return, unless someone changed them since.

### What an import never overwrites
- Fields **staff edited** in Kinus (a bunk moved by hand, a corrected name…).
- **Fixes** to export columns (Hebrew names fixed on Print → Hebrew names, corrections in a camper's Edit tab, values added from a file of extra details): Kinus shows the fix whatever the export says.
- **Protected columns** (Settings → Protected columns) change only from "our corrected copy".
`,
  },
  {
    id: "add-info",
    title: "Adding info from a short file",
    summary: "A file with registration IDs and a few columns, for some campers.",
    body: `
For a file with **extra details for some campers**, not the whole export (e.g. registration ID + bus number + room): **Setup → Import roster → Add info to campers**.

1. Choose the file (Excel or CSV). Kinus finds the registration ID column itself (\`students.id\`, "Registration ID", "Student ID", "ID"); change it if it picked the wrong one.
2. It shows how many rows match a camper of this session, the IDs it couldn't find, and each other column with samples.
3. Tick the columns to add and name them, then **Add**.

Only those columns, only those campers: **no names needed, nobody is added, moved or marked missing**, empty cells change nothing. The values are kept like Kinus' own corrections, so the next full export doesn't wipe them. The columns then work like any export column: camper page and Edit tab, list layouts (columns, combined columns, filters, grouping), labels, Search, who sees each, short answers.

**Preparing the file:** one row per camper, a header row, the registration ID exactly as in the export (a number formatted as text is fine; "1234.0" from Excel is understood).
`,
  },
  {
    id: "columns",
    title: "Registration columns: names, who sees them, short answers",
    summary: "Settings → Extra fields, Roles page kinds, Hide answers, Family situations.",
    body: `
Every export column Kinus has no field of its own for is an **added column**. Manage them in **Settings → Extra fields from the export** (and who sees them also on **Setup → Roles**).

- **Name**: what it's called everywhere ("Sleeping at the Kinus").
- **Show**: untick to leave a column out (it moves to "Left out", where it can be shown again).
- **Who sees this** (**⚙ Setting**, per column; the current choices are in How it's set up now): guessed from the name (medical-looking → medical, phone/parent → contacts, address → address, notes → notes from parents, else everyone), or chosen: everyone who sees the camper, or a kind of detail. **Family situations** is a kind of its own for sensitive family information (custody, a hard time at home); only the roles ticked for it on Roles see it.
- **Short answers** (**⚙ Setting**): a shorter wording for long answers ("Yes, at the Kinus (In the dorms)" → "Sleeping here"), shown on the camper page and in lists.
- **Hide** (**⚙ Setting**, per answer): for answers that mean nothing special ("No", "None"): they show **nothing** on the camper page, in lists and in combined columns.

On **Setup → Roles**, "What each kind of detail covers" lists every kind with its fields, the added columns in it and the roles that see it, and lets you put each added column in a kind.

The camper page shows only the added columns that have something in them.
`,
  },
  {
    id: "hebrew",
    title: "Hebrew names and Hebrew divisions",
    summary: "Fixing Hebrew names, Hebrew-language divisions, sorting.",
    body: `
### Fixing Hebrew names (Print → Hebrew names)
The Hebrew name columns are the ones the Hebrew-name label fields read (\`{{HEB_FIRST}}\`, \`{{HEB_LAST}}\`). The page lists campers whose Hebrew name is **typed in English letters**, **spelled out**, or **empty**, with a suggestion, and lets you fix each (Hebrew letters only, final letters at word ends). A fix prints at once and new uploads keep it. Claude can do this too (list_hebrew_names / fix_hebrew_names).

### Hebrew-language divisions
A division's language is a **⚙ Setting** on **Divisions & bunks** (English, Hebrew, French); which divisions are Hebrew now is in How it's set up now.
- **Hebrew divisions show their campers by their Hebrew name** (with the English one beside it): Campers, Who's here, check-in, the camper page; typing the name in Hebrew finds them (final letters don't matter).
- A camper whose Hebrew name isn't in Hebrew letters keeps the English name until it's fixed.

### Sorting by name on printed tags
"By name" order uses the name the tag prints. In **Hebrew and French divisions** campers sort by their Hebrew last name when the template has one and it's written in Hebrew letters; a "Hebrew" last name typed in English letters sorts with the English names, after the Hebrew ones. Other divisions sort by the English last name. A stray quote or space before a name is ignored.
`,
  },
  {
    id: "places",
    title: "Divisions, bunks and camps",
    summary: "Names, order, colours, language, empty bunks, camps.",
    body: `
**Setup → Divisions & bunks.**
- Divisions belong to a **camp** (American, Hebrew, French…): the camp switcher at the top of the menu narrows every page to one camp.
- Order: divisions and bunks are listed (and print) in the order set here; bunk numbers follow their order (Alef = 1, Beis = 2…), giving \`{{BUNK_NUMBER}}\`, \`{{BUNK_LETTERS}}\` (11 → יא) and \`{{BUNK_CONTINUED}}\` (numbers continuing from camp to camp; staff get one number per division after the last bunk).
- **Colour**: used on Who's here, the check-in line and labels (\`{{DIVISION_COLOR}}\`).
- **Language**: see Hebrew divisions.
- Empty bunks fold into "N empty bunks"; **Remove empty ones** removes bunks with no campers (archived campers don't count).
- The export's bunk format ("Bunk סה - Online School Only") is read into the bunk's name.

**Buzzer numbers** are given in this order: division by name (1, 2, 3, then A–Z), then bunk (in Alef-Beis order), then last name. The Thursday Program's second records get none (the camper has theirs on their regular record).
`,
  },
  {
    id: "checkin",
    title: "Check-in, check-out and Who's here",
    summary: "The check-in page, lines, undo, labels, final check-out, follow-ups.",
    body: `
### The check-in page
The whole page is the camera. Over it:
- **Check in / Check out / Look up** (the mode). Check out means "coming back"; going home is **Final check-out**.
- **Type a name** (any order, misspelt, Hebrew, the code or buzzer number) instead of scanning. A handheld USB/Bluetooth scanner works without touching anything.
- Sound and camera buttons. Phones only make sound after a tap: tap the screen once and scans beep (iPhones play it even on silent).
- **The line**: someone who checks in more than one division picks the line they're at; a camper from another division asks before recording.
- **Labels to print** (for people with print access): straight to that line's queue.

A scan shows the result over the picture. Scanning someone already checked in says so, offers **Check out**, and offers their **Labels** (a new name tag…).

At the bottom, **the last 50 check-ins** (kept across reloads): pull up to see them, **Undo** (for 15 minutes, while it's still the camper's latest record; after that a director corrects it on the camper page), or open one to request labels.

### Who's here
Every camper of a place, live: counts by status (here, out, expected, check up, coming later, gone home, not coming), search, sort, parent phones (if allowed). "Check up" flags campers still missing once enough of their division has arrived or after a time (**⚙ Setting**: Settings → Campers who haven't arrived; the current rule is in How it's set up now). Directors can change many at once.

### Final check-out
Check-in logins can be given final check-out (Staff → check-in logins): every scan records "gone home" for any division of the camp, with progress per division.
`,
  },
  {
    id: "printing",
    title: "Printing: the queue, batches and on-the-spot labels",
    summary: "Print queue, Print all waiting, PDFs, NIIMBOT, batches and print order.",
    body: `
### Where prints come from
- **Print a batch** (Print → Print a batch): one template for everyone you can print for, a division, a bunk, or some campers. **Which campers**: not printed yet, new or changed since printed, everyone, here now, arrived today. **Order**: by bunk, by division or by name. Deliver to the queue, or email the PDF.
- **Camper card / check-in**: the templates set "Print button at check-in" (the 50×80 thermal name tag and bag label) can be requested for one camper; they go to the queue.
- **Claude**: queue_print_job (same choices, or a whole camp in one job), and delete_print_job takes off the queue jobs you asked for that aren't printed yet.

### The print queue (Print)
- Someone over part of camp (a division head, an office person for one camp…) sees only their divisions' requests and their own; the camp and division bars show only theirs.
- **Print all waiting** (top of the page): every label-printer label still to print, by label size, **sorted by name, each camper's labels together** (name tag, then bag label). Buttons: **Print all**, **Merged PDF** (in parts of 400 labels), and after printing **Mark printed** (only what went out; requests that came in since stay waiting).
- On a phone, the PDF buttons (Print all waiting, the queue's PDF, a request's Download PDF) download the file and then say how to print it on the label printer. On **Android**: **open** the PDF (Open in the download bar, or Files → Downloads) and choose NIIMBOT; don't share it, as sharing doesn't list NIIMBOT. **If opening it doesn't offer NIIMBOT, open the NIIMBOT app and print the PDF from there.** On an **iPhone**: open the NIIMBOT app and pick the PDF.
- Label sheets print on their own (Print together), with "where the sheet starts" for a part-used sheet.
- Asking for a camper's labels from their card emails the office a PDF only when **"Email it to the office as a PDF"** is ticked (off by default): otherwise they wait in the queue. Batches choose queue or email each time. The office's address is a **⚙ Setting** (Settings → Office email).

### Printing well
- Thermal printers: choose the label size in the print dialog, scale 100% / "actual size", no margins. 4×6 labels print the right way round (Kinus turns the pages itself).
- Sheets: print at 100% (not "fit to page") on the exact sheet the template names.
`,
  },
  {
    id: "templates",
    title: "Templates: the tags and labels we use",
    summary: "Each template, its paper, what's on it and why; folders; fields; conversions; designing.",
    body: `
**⚙ Setting**: the templates are made and changed on **Print → Templates**, so the table below is how they were set up when this guide was written: **the current templates (names, paper, camps, copies) are in How it's set up now.**

**Print → Templates**, grouped in folders (Move to… on a template's card puts it in a folder or a new one; Rename on a folder; Claude can organize them all at once). Each template has a version per camp (American, Hebrew, French): a template "for some camps only" prints just for those campers.

### The templates
| Folder | Template | Paper | What's on it |
|---|---|---|---|
| Check-in labels (thermal 50×80) | Name Tag 50×80 | 50 × 80 mm thermal label, one per label | QR code, camper code, name (wraps when long), from, Bunk (Hebrew letters), division. Print button at check-in. |
| Check-in labels (thermal 50×80) | Bag Label 50×80 fold | 50 × 80 mm thermal, folded in half round the bag handle | The same details twice: the top half upside down, so both faces read the right way once folded; fold marks at the middle. |
| Name badges | Name Tag/Badge (and Hebrew, French), Virtual Kinus Badge | 110 × 142 mm badge, two-sided (flip on the long edge) | Division artwork behind (a picture per division), QR, code, name, from, bunk on both sides. |
| Luggage tags | Luggage Tag (Colored Labels) | 1″ × 2⅝″ address labels, 30 per sheet (OnlineLabels OL875) | Last, first; from; Bunk (letters); division; bunk number large; code. **2 per camper.** |
| Coat tags | Coat Tag (fold in half) | Same 1″ × 2⅝″ labels, folded in half | The same details on both halves. |
| Packing labels (4×6) | Packing Labels | 4 × 6 in thermal label | Hebrew name large, English name, from, Bunk, division, bunk number, T-shirts, yarmulka size, and "Find inside: Yarmulke, T-Shirt, 2 Luggage Tags, Kinus Badge". |
| Other labels | Shabbos Labels | Avery 5160, 30 per sheet | Last, first; bunk; division; #code. All camps. |
| Other labels | Buzzer sticker | 1½″ round labels | The buzzer number. |
| Staff | Name Tag/Badge – Staff, Luggage Tag – Staff | Badge; 1″ × 2⅝″ labels (2 per person) | Staff name, phone, division, "STAFF". Printed from Print → Staff tags. |

### Fields (what a tag can say)
\`{{FIRST}}\`, \`{{LAST}}\`, \`{{FULL}}\`, \`{{CODE}}\` (4-digit camper code), \`{{BARCODE}}\` (KN + code, for QR/barcodes), \`{{DIVISION}}\`, \`{{DIV}}\` (division number), \`{{DIVISION_COLOR}}\`, \`{{BUNK}}\`, \`{{BUNK_SHORT}}\`, \`{{BUNK_NUMBER}}\`, \`{{BUNK_LETTERS}}\`, \`{{BUNK_CONTINUED}}\`, \`{{BUNK_HEBREW}}\`, \`{{BUNK_BIG}}\`, \`{{GRADE}}\`, \`{{TSHIRT}}\` (the T-shirt code, e.g. YS/130), \`{{HEB_FIRST}}\`, \`{{HEB_LAST}}\`, \`{{YARMULKA}}\`, \`{{FROM}}\` (city, state country), \`{{BUZZER}}\`, and any export column. \`{{A|B}}\` prints A, or B when A is empty. Staff tags have their own fields (name, position, role, division, bunk, phone…); on a staff tag \`{{BUNK_CONTINUED}}\` is their division's number, carrying on after the last bunk number (if the bunks end at 140, the first division's staff are 141, the second's 142, and so on, divisions in camp order then their own order).

Fields and their **conversions** (export answers turned into what prints: T-shirt sizes into codes, division names into numbers…) are made on **Print → Fields & conversions**.

### Designing
- Open a template, or ask Claude (it previews every change exactly as it prints and checks that every real camper's name fits).
- Long names: text shrinks to fit (down to its smallest size), and a name can wrap to two lines only when it's very long.
- Thermal templates print in black and white, one label per page.
- A template "Print button at check-in" shows on camper cards and the check-in page; "Prints by itself at first check-in" queues itself.
- Fonts: upload your own (Templates → Fonts); the badges use the Brother 1816 font.
`,
  },
  {
    id: "lists",
    title: "Lists and list layouts",
    summary: "Lists page, filters, cover page, layouts, combined columns, grouping.",
    body: `
### The Lists page
Pick a **list** (a layout), a division and a bunk. **Filter by** any of the list's columns (or a field inside a combined column), then **Is**: an answer that's in the list (with counts), "Has anything" or "Empty". **Show counselors** adds each bunk's counselors and phones under the bunk. **Print** (or Save as PDF) starts with a **cover page** (session, camp, list name, who it covers, counts, the groups), then each group on its own page; wide lists print sideways. **Copies of each** (set on the layout, ⚙ Setting, or changed on the page before printing): each group prints that many times one after another (bunk Alef ×3, then bunk Beis ×3…), instead of the whole list over again. **Excel / CSV** downloads follow the same choices.

### List layouts (Setup → List layouts)
- Layouts are **⚙ settings** made here (which layouts exist, their columns and filters are chosen by the people setting up Kinus).
- **Who uses it**: the role whose people see it on Lists.
- **Columns**: by kind (Camper, Contacts, Medical, Address, Notes from parents, Staff notes, Family situations): Kinus' fields and the export columns of that kind. People only see the columns their role may see.
- **Combined columns**: several fields in one column, to save room ("M · Sleeping here · 6¾"). **Ctrl-click** (⌘ on a Mac, long-press on a phone) the fields in Columns, then **Group into a new column** (or add them to one there is) in the box at the top. Each combined column: name, what goes between (· , / or one per line), Name each ("Shirt: M"), Show, fields as chips (drag or ‹ › to reorder, × to take out), ↑ ↓ to order the combined columns, Split back, Remove. Empty values and hidden answers are left out; a yes/no field shows its name when yes. Fields in a combined column are marked in its colour.
- **Group the list by**: bunk (a page per bunk), division, nothing, or **any field** (each answer gets a heading: Sleeping here / Going home, each T-shirt size…).
- **Sort** by last name, first name, grade or code.
- **Only campers who have** (medical flag, notes…) and **Only campers whose…** filters saved with the layout: **Add a filter**, pick any field (Kinus' own, Sleeping, any export column, by kind), then tap its answers (this session's, with how many campers have each), or **Has anything** / **Empty**. Several answers: any of them (**Empty** goes with answers too: "empty or Yes"; **Has anything** stands alone, as it covers every answer); several filters: every one must match.
`,
  },
  {
    id: "staff",
    title: "Staff, roles and the phone book",
    summary: "Adding staff, the staff import, check-in logins, merging duplicates, phone book.",
    body: `
- **Add a person**, or **Add many at once**: paste or upload a sheet (name, email, role, division, bunk, title, phone) or the staff registration export / master sheet. Counselors are usually **listed only** (in the phone book and bunk lists, without signing in) unless the sheet says they sign in.
- **Areas**: all of camp, a camp, a division or a bunk; they decide which campers a person sees.
- **Check-in logins**: shared logins for the phones at a division's check-in line (check-in pages only); one can be given final check-out.
- **Same person twice?** (someone added by hand, then again by the staff import): Staff lists "Possibly the same person twice" (same name or phone); **Review and merge** keeps the one that signs in and the import's phone and details, moves areas and history over, and deletes the copy.
- **Phone book**: the staff of your divisions, searchable, with pills for division and role; one tap to call, text or email.
- **Texts to staff** (Text staff): to everyone (directors over all of camp) or the staff of chosen divisions, every role or only some (just the counselors, or the head counselors and division heads). What people text back is listed under **Replies** on Text staff (newest first, with the person's division and the text it probably answers) and under that text. Texts don't say which message they answer: Kinus takes the latest text that person got in the week before. Replies show only for the head staff of the replier's own division and up (its division head, kloli, head counselors, directors over that part of camp and over all of camp), never another division's or camp's. A text from someone in no division (a sign-up, an unknown number) is for directors over all of camp.
- **Staff tags**: Print → Staff tags (the staff badge and staff luggage tags): pick who, then **Print** now or **Add to the print queue** (it prints with the rest, as the tags read when added). **Blank badges**: a division's design with no name, as many as needed, for staff not on the list yet. **Division on a name tag** (what the badge says, and its design): the staff sheet's "Division (name tag)", or set it on the person's page (Staff → their name → Name tag): set there, it stays through the next staff sheet upload. Claude: queue_staff_print_job.
`,
  },
  {
    id: "find",
    title: "Search and the activity log",
    summary: "Searching everything; who changed what.",
    body: `
**Search** (in the menu): one box for everything you may see, or one part (pills): campers (names, codes, buzzers, parent phones, anything in their export columns), staff, print requests, templates, divisions and bunks, texts, imports, and for owners and directors the activity log.

**Activity** (Setup → Activity, owners and directors): every change in Kinus, newest first: who made it, from which page, each field old → new; sign-ins (and failed tries), downloads and prints. Filter by person, kind, day or camper, or search the words in it.
`,
  },
  {
    id: "settings",
    title: "Settings",
    summary: "What's on the Settings page.",
    body: `
Everything here is a **⚙ Setting**; the current values are in How it's set up now.
- **Who can see and do what**: opens Roles.
- **Campers who haven't arrived**: when "check up" flags start (share of the division arrived, or a time).
- **Extra fields from the export**: names, Show, who sees each, short answers, Hide (see Registration columns).
- **Office email** (where emailed requests go), with a test email.
- **Protected columns**: details our corrected copy may change (and later exports keep), e.g. cleaned medical notes.
- **Imports**: warn when more than this share of a division is missing from an uploaded export.
`,
  },
];

/** The guide as one Markdown document (or one section). */
export function guideText(id?: string | null): string | null {
  const parts = id ? GUIDE.filter((s) => s.id === id) : GUIDE;
  if (!parts.length) return null;
  return parts.map((s) => `## ${s.title}\n${s.body.trim()}`).join("\n\n");
}

/** The live part: this camp's actual settings (lib/help/live), not in the written guide. */
export const LIVE_SECTION = { id: "now", title: "How it's set up now", summary: "This camp's actual settings, read live: roles and what each sees, added columns and who sees them, templates, divisions, settings." };

/** The table of contents: each section's id, title and what it covers (and the live part, when given). */
export const guideContents = (withLive = false) =>
  [...(withLive ? [LIVE_SECTION] : []), ...GUIDE].map((s) => `- **${s.id}**: ${s.title}. ${s.summary}`).join("\n");
