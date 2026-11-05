import { describe, it, expect } from "vitest";
import { locksFor } from "../protected";
import { cleanBunkName } from "../mapping";
import { compareBunkNames, hebrewLetterNumber } from "@/lib/bunk-order";
import { readFileSync } from "node:fs";
import path from "node:path";
import iconv from "iconv-lite";
import {
  resolveMultiValues,
  splitList,
  parseFile,
  decodeText,
  findLostText,
  applyMapping,
  matchAndDiff,
  normalizeName,
  DEFAULT_COLUMN_MAP,
  DEFAULT_MAPPING_OPTIONS,
  type ExistingCamper,
} from "../index";

const fixture = (name: string) => new Uint8Array(readFileSync(path.join(process.cwd(), "docs/fixtures", name)));

describe("normalizeName", () => {
  it("strips accents and niqqud, maps Hebrew finals, collapses space", () => {
    expect(normalizeName("Léa  Gérard")).toBe("lea gerard");
    expect(normalizeName("כהן")).toBe("כהנ");
    expect(normalizeName("מְנַחֵם")).toBe("מנחמ");
  });
});

describe("decodeText", () => {
  it("reads UTF-8 with BOM", () => {
    const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("שלום,Léa", "utf8")]);
    const d = decodeText(new Uint8Array(buf));
    expect(d.encoding).toBe("utf-8-bom");
    expect(d.text).toBe("שלום,Léa");
  });
  it("recovers a Windows-1255 Hebrew file", () => {
    const d = decodeText(new Uint8Array(iconv.encode("id,name\n1,אלישע פיש\n", "win1255")));
    expect(d.encoding).toBe("windows-1255");
    expect(d.text).toContain("אלישע פיש");
  });
  it("recovers a Windows-1252 French file", () => {
    const d = decodeText(new Uint8Array(iconv.encode("id,name\n1,Léa Gérard\n", "win1252")));
    expect(d.encoding).toBe("windows-1252");
    expect(d.text).toContain("Léa Gérard");
  });
});

describe("parseFile + applyMapping on the real export header", () => {
  const parsed = parseFile(fixture("export-sample.csv"), "export-sample.csv");
  it("reads 30 columns and one data row", () => {
    expect(parsed.headers).toHaveLength(30);
    expect(parsed.headers).toContain("group_types.french_bunks");
    expect(parsed.rows).toHaveLength(1);
  });
  it("maps the synthetic camper row", () => {
    const c = applyMapping(parsed.rows[0], DEFAULT_COLUMN_MAP, DEFAULT_MAPPING_OPTIONS);
    expect(c.source_id).toBe("2162");
    expect(c.first_name).toBe("Camper");
    expect(c.division_name).toBe("Division 2");
    expect(c.bunk_name).toBe("Bunk Chof");
    expect(c.tshirt_size).toBe("Youth Small");
    expect(c.has_epipen).toBe(false);
    expect(c.has_allergies).toBe(false);
    expect(c.bunk_preferences).toEqual(["Freind 1", "Random Friend", "Next Friend"]);
    const mother = c.contacts.find((k) => k.role === "mother");
    expect(mother?.name).toBe("Mothers name");
    const father = c.contacts.find((k) => k.role === "father");
    expect(father?.name).toBe("Fathers Name His last name");
    expect(father?.email).toBe("father@yahoo.de");
    const em2 = c.contacts.find((k) => k.role === "emergency" && k.slot === 2);
    expect(em2?.phone_e164).toBe("+17182222222");
    expect(c.source_data["students.id"]).toBe("2162");
  });
  it("prefers the Hebrew bunk column when filled", () => {
    const row = { ...parsed.rows[0], "group_types.hebrew_bunks": "Group 112", "group_types.bunks": "Bunk Chof" };
    expect(applyMapping(row, DEFAULT_COLUMN_MAP, DEFAULT_MAPPING_OPTIONS).bunk_name).toBe("Group 112");
  });
  it("handles sparse registration rows", () => {
    const row = Object.fromEntries(parsed.headers.map((h) => [h, ""]));
    Object.assign(row, { "students.id": "2259", "students.first_name": "Moish", "students.last_name": "Hecht", "group_types.division": "Division 1" });
    const c = applyMapping(row, DEFAULT_COLUMN_MAP, DEFAULT_MAPPING_OPTIONS);
    expect(c.bunk_name).toBeNull();
    expect(c.has_epipen).toBeNull();
    expect(c.contacts).toEqual([]);
    expect(c.warnings).toEqual([]);
  });
  it("flags unknown yes/no values", () => {
    const row = { ...parsed.rows[0], "ppa.epipen_yes_no": "maybe" };
    const c = applyMapping(row, DEFAULT_COLUMN_MAP, DEFAULT_MAPPING_OPTIONS);
    expect(c.has_epipen).toBeNull();
    expect(c.warnings[0]).toMatch(/unrecognised yes\/no/);
  });
});

describe("lost-text guard", () => {
  it("catches WPS-mangled Hebrew", () => {
    const hits = findLostText(["a", "b"], [{ a: "Group ????? 112", b: "fine" }, { a: "x", b: "single ? ok" }]);
    expect(hits).toEqual([{ row: 2, column: "a", value: "Group ????? 112" }]);
  });
});

const base: ExistingCamper = {
  id: "c1",
  source_id: "2509",
  first_name: "אלישע",
  last_name: "פיש",
  division_name: "Hebrew Division",
  bunk_name: "Group 112",
  bunk_locked_by_staff: false,
  grade: "4",
  tshirt_size: "Youth Small",
  bunk_preferences: [],
  local_address: "1 Kingston",
  local_address_cross_streets: null,
  medical_notes: null,
  allergies: null,
  has_allergies: false,
  has_epipen: false,
  has_medications: null,
  notes_from_parents: null,
  contacts: [{ role: "mother", slot: 1, name: "Ima", phone: "+1 718 222 2222", phone_e164: "+17182222222", email: null, source: "import" }],
};
const parsedFor = (over: Partial<ReturnType<typeof applyMapping>> = {}) => ({
  source_id: "2509",
  first_name: "אלישע",
  last_name: "פיש",
  division_name: "Hebrew Division",
  bunk_name: "Group 112",
  division_candidates: ["Hebrew Division"],
  bunk_candidates: ["Group 112"],
  grade: "4",
  tshirt_size: "Youth Small",
  bunk_preferences: [],
  local_address: "1 Kingston",
  local_address_cross_streets: null,
  medical_notes: null,
  allergies: null,
  has_allergies: false,
  has_epipen: false,
  has_medications: null,
  notes_from_parents: null,
  contacts: [{ role: "mother" as const, slot: 1, name: "Ima", phone: "+1 718 222 2222", phone_e164: "+17182222222", email: null }],
  source_data: {},
  warnings: [],
  ...over,
});
const known = [{ name: "Hebrew Division", bunks: ["Group 112"] }];
const opts = { takeBunksFromFile: false, emptyMeansUnknown: true };

describe("matchAndDiff", () => {
  it("reports unchanged when nothing differs", () => {
    const r = matchAndDiff([{ rowNumber: 2, parsed: parsedFor() }], [base], known, opts);
    expect(r.rows[0].action).toBe("unchanged");
    expect(r.rows[0].matchMethod).toBe("source_id");
    expect(r.summary.missing).toEqual([]);
  });
  it("lists field-level changes including contacts and new bunks", () => {
    const r = matchAndDiff(
      [{ rowNumber: 2, parsed: parsedFor({ bunk_name: "Group 113", grade: "5", contacts: [{ role: "mother", slot: 1, name: "Ima", phone: "+1 718 333 3333", phone_e164: "+17183333333", email: null }] }) }],
      [base],
      known,
      opts,
    );
    expect(r.rows[0].action).toBe("update");
    expect(r.rows[0].changes).toEqual([
      { field: "grade", old: "4", new: "5" },
      { field: "bunk", old: "Group 112", new: "Group 113" },
      { field: "contact[mother,1].phone", old: "+17182222222", new: "+17183333333" },
    ]);
    expect(r.summary.newBunks).toEqual(["Hebrew Division / Group 113"]);
  });
  it("keeps a staff-locked bunk unless told otherwise", () => {
    const locked = { ...base, bunk_locked_by_staff: true };
    const r1 = matchAndDiff([{ rowNumber: 2, parsed: parsedFor({ bunk_name: "Group 113" }) }], [locked], known, opts);
    expect(r1.rows[0].action).toBe("unchanged");
    expect(r1.rows[0].warnings[0]).toMatch(/kept staff assignment/);
    const r2 = matchAndDiff([{ rowNumber: 2, parsed: parsedFor({ bunk_name: "Group 113" }) }], [locked], known, { ...opts, takeBunksFromFile: true });
    expect(r2.rows[0].changes).toEqual([{ field: "bunk", old: "Group 112", new: "Group 113" }]);
  });
  it("treats empty cells as unknown", () => {
    const sparse = parsedFor({ bunk_name: null, grade: null, tshirt_size: null, local_address: null, has_allergies: null, has_epipen: null, contacts: [] });
    const r = matchAndDiff([{ rowNumber: 2, parsed: sparse }], [base], known, opts);
    expect(r.rows[0].action).toBe("unchanged");
    const r2 = matchAndDiff([{ rowNumber: 2, parsed: sparse }], [base], known, { ...opts, emptyMeansUnknown: false });
    expect(r2.rows[0].changes.map((c) => c.field)).toEqual(["grade", "tshirt_size", "local_address", "has_allergies", "has_epipen", "bunk", "contact[mother,1]"]);
  });
  it("matches by name when the file has no id, conflicts on ambiguity, adds otherwise", () => {
    const noId = { ...base, source_id: null };
    const r = matchAndDiff([{ rowNumber: 2, parsed: parsedFor({ source_id: null }) }], [noId], known, opts);
    expect(r.rows[0].matchMethod).toBe("name");
    const twin = { ...noId, id: "c2" };
    const r2 = matchAndDiff([{ rowNumber: 2, parsed: parsedFor({ source_id: null }) }], [noId, twin], known, opts);
    expect(r2.rows[0].action).toBe("conflict");
    expect(r2.rows[0].candidates).toHaveLength(2);
    const r3 = matchAndDiff([{ rowNumber: 2, parsed: parsedFor({ source_id: "9999", first_name: "New", last_name: "Kid" }) }], [base], known, opts);
    expect(r3.rows[0].action).toBe("add");
    expect(r3.summary.added).toBe(1);
  });
  it("flags duplicate ids inside the file and campers missing from it", () => {
    const other: ExistingCamper = { ...base, id: "c9", source_id: "7777", first_name: "Gone", last_name: "Kid" };
    const r = matchAndDiff([{ rowNumber: 2, parsed: parsedFor() }, { rowNumber: 3, parsed: parsedFor() }], [base, other], known, opts);
    expect(r.rows[1].action).toBe("conflict");
    expect(r.summary.missing).toEqual([{ id: "c9", display_name: "Gone Kid", division_name: "Hebrew Division" }]);
    expect(r.summary.divisionsInFile).toEqual(["Hebrew Division"]);
  });
  it("moves a camper to a new division and re-resolves the bunk", () => {
    const r = matchAndDiff([{ rowNumber: 2, parsed: parsedFor({ division_name: "French Division", bunk_name: "F1" }) }], [base], known, opts);
    expect(r.rows[0].changes.map((c) => c.field)).toEqual(["division", "bunk"]);
    expect(r.summary.newDivisions).toEqual(["French Division"]);
  });
});

describe("multi-value divisions and bunks", () => {
  it("splits comma-joined values", () => {
    expect(splitList("Division 3,Division 2")).toEqual(["Division 3", "Division 2"]);
    expect(splitList("Group 107 עברית, Group 108 עברית")).toEqual(["Group 107 עברית", "Group 108 עברית"]);
    expect(splitList(" ")).toEqual([]);
  });
  const row = (division: string, bunk: string) => {
    const r = Object.fromEntries(Object.keys(DEFAULT_COLUMN_MAP).map((h) => [h, ""]));
    Object.assign(r, { "students.id": Math.random().toString(), "students.first_name": "A", "students.last_name": "B", "group_types.division": division, "group_types.bunks": bunk });
    return { parsed: applyMapping(r, DEFAULT_COLUMN_MAP, DEFAULT_MAPPING_OPTIONS) };
  };
  it("places a two-division camper where their bunk lives", () => {
    const rows = [row("Bar Mitzvah Program", "Bunk Nun Vov"), row("Division 3,Bar Mitzvah Program", "Bunk Nun Vov")];
    resolveMultiValues(rows, []);
    expect(rows[1].parsed.division_name).toBe("Bar Mitzvah Program");
    expect(rows[1].parsed.bunk_name).toBe("Bunk Nun Vov");
    expect(rows[1].parsed.warnings[0]).toMatch(/Bunk Nun Vov belongs to Bar Mitzvah Program/);
    expect(rows[0].parsed.warnings).toEqual([]);
  });
  it("uses bunks already in the database", () => {
    const rows = [row("Division 2,Division 1", "Bunk Yud Beis")];
    resolveMultiValues(rows, [{ name: "Division 1", bunks: ["Bunk Yud Beis"] }]);
    expect(rows[0].parsed.division_name).toBe("Division 1");
  });
  it("picks a known bunk when several are listed, else the first", () => {
    const rows = [row("Division 1", "Bunk Yud"), row("Division 1", "Bunk Zayin,Bunk Yud")];
    resolveMultiValues(rows, []);
    expect(rows[1].parsed.bunk_name).toBe("Bunk Yud");
    const lone = [row("Division 9,Division 8", "")];
    resolveMultiValues(lone, []);
    expect(lone[0].parsed.division_name).toBe("Division 9");
    expect(lone[0].parsed.warnings[0]).toMatch(/first one listed/);
  });
  it("never creates comma-joined divisions", () => {
    const rows = [row("Division 3,Division 2", "Bunk Mem Gimmel")];
    resolveMultiValues(rows, []);
    expect(rows[0].parsed.division_name).not.toContain(",");
  });
});

describe("staff-locked placement", () => {
  it("keeps a locked camper's division and bunk", () => {
    const locked = { ...base, bunk_locked_by_staff: true };
    const r = matchAndDiff([{ rowNumber: 2, parsed: parsedFor({ division_name: "French Division", bunk_name: "F1" }) }], [locked], known, opts);
    expect(r.rows[0].action).toBe("unchanged");
    expect(r.rows[0].warnings[0]).toMatch(/kept the placement staff set/);
  });
  it("never overwrites details staff changed in Kinus", () => {
    const nurse = { ...base, has_allergies: true, allergies: "Peanuts", staff_edited: ["has_allergies", "allergies"] };
    const r = matchAndDiff([{ rowNumber: 2, parsed: parsedFor({ has_allergies: false, allergies: null, grade: "5" }) }], [nurse], known, { ...opts, emptyMeansUnknown: false });
    expect(r.rows[0].changes).toEqual([{ field: "grade", old: "4", new: "5" }]);
    expect(r.rows[0].warnings.join(" ")).toMatch(/kept the has allergies staff entered in Kinus \(Yes\); the file says No/);
  });
  it("a corrected copy can erase a protected detail even when empty cells mean unknown", () => {
    const raw = { ...base, medical_notes: "Asthma, full history from the form" };
    const r = matchAndDiff([{ rowNumber: 2, parsed: parsedFor({ medical_notes: null }) }], [raw], known, { ...opts, emptyMeansUnknown: true, clearable: ["medical_notes"] });
    expect(r.rows[0].changes).toEqual([{ field: "medical_notes", old: "Asthma, full history from the form", new: null }]);
    const regular = matchAndDiff([{ rowNumber: 2, parsed: parsedFor({ medical_notes: null }) }], [raw], known, { ...opts, emptyMeansUnknown: true });
    expect(regular.rows[0].changes).toEqual([]);
  });
  it("locks only what the corrected copy changed, camper by camper", () => {
    const p = { fields: ["medical_notes", "allergies"], columns: ["ppa.medical", "Medical for counselors"] };
    const registration = { "ppa.medical": "full form text", "ppa.city": "Lyon" };
    // changed medical notes, a cleaned column, a column added by hand; allergies left alone
    const locks = locksFor([{ field: "medical_notes" }, { field: "grade" }], { "ppa.medical": "cleaned", "Medical for counselors": "inhaler in bag", "ppa.city": "Lyon" }, registration, registration, p);
    expect(locks).toEqual({ fields: ["medical_notes"], columns: [{ column: "ppa.medical", value: "cleaned", was: "full form text" }, { column: "Medical for counselors", value: "inhaler in bag", was: "" }] });
    // a camper the office didn't touch: nothing locked, the export keeps updating them
    expect(locksFor([], registration, registration, registration, p)).toEqual({ fields: [], columns: [] });
  });
  it("matches an archived camper by registration id instead of adding them again, and brings them back", () => {
    const r = matchAndDiff([{ rowNumber: 2, parsed: parsedFor() }], [{ ...base, archived: true }], known, opts);
    expect(r.rows[0].action).toBe("update");
    expect(r.rows[0].changes[0]).toEqual({ field: "archived", old: "Archived", new: "Back (in the export)" });
    expect(r.rows[0].matchedCamperId).toBe("c1");
    expect(r.rows[0].warnings.join(" ")).toMatch(/archived in Kinus/);
  });
  it("doesn't count walk-ins or archived campers as missing from the file", () => {
    const walkIn = { ...base, id: "w1", source_id: null, first_name: "Walk", last_name: "In" };
    const archived = { ...base, id: "a1", source_id: "9999", archived: true };
    const r = matchAndDiff([{ rowNumber: 2, parsed: parsedFor() }], [base, walkIn, archived], known, opts);
    expect(r.summary.missing).toEqual([]);
  });
});

describe("rows with a registration id and no name", () => {
  it("updates the camper with that id and keeps their name", () => {
    const r = matchAndDiff([{ rowNumber: 2, parsed: parsedFor({ first_name: "", last_name: "", grade: "5", warnings: ["row has no name"] }) }], [base], known, opts);
    expect(r.rows[0].action).toBe("update");
    expect(r.rows[0].matchMethod).toBe("source_id");
    expect(r.rows[0].changes).toEqual([{ field: "grade", old: "4", new: "5" }]);
    expect(r.rows[0].warnings).not.toContain("row has no name");
    // even when empty cells count (a full export), the empty name never wipes theirs
    const full = matchAndDiff([{ rowNumber: 2, parsed: parsedFor({ first_name: "", last_name: "" }) }], [base], known, { ...opts, emptyMeansUnknown: false });
    expect(full.rows[0].changes.map((c) => c.field)).not.toContain("first_name");
    expect(full.rows[0].changes.map((c) => c.field)).not.toContain("last_name");
  });
  it("skips an id nobody has: a new camper needs a name", () => {
    const r = matchAndDiff([{ rowNumber: 2, parsed: parsedFor({ source_id: "9999", first_name: "", last_name: "" }) }], [base], known, opts);
    expect(r.rows[0].action).toBe("skip");
    expect(r.rows[0].warnings.join(" ")).toMatch(/9999.*needs a name/);
    const none = matchAndDiff([{ rowNumber: 2, parsed: parsedFor({ source_id: null, first_name: "", last_name: "" }) }], [base], known, opts);
    expect(none.rows[0].action).toBe("skip");
  });
});

describe("bunks as the registration export writes them", () => {
  const all = ["Bunk לב", "Bunk סה - Online School Only", "Bunk נו - Online School Only", "Bunk ל - Online School Only", "Bunk טז - Online School Only", "Bunk טו - Online School Only", "Bunk יד - Online School Only", "Bunk מג - Online School Only", "Bunk יט", "Bunk א", "Bunk ס", "Bunk כ", "Bunk סד", "Bunk נט"];
  it("reads the bunk without the Online School note", () => {
    const c = applyMapping({ "group_types.bunks": "Bunk סה - Online School Only" }, { "group_types.bunks": "bunk" }, {});
    expect(c.bunk_name).toBe("Bunk סה");
    expect(applyMapping({ "group_types.bunks": "" }, { "group_types.bunks": "bunk" }, {}).bunk_name).toBeNull();
  });
  it("puts them in Alef-Beis order by number", () => {
    const names = [...new Set(all.map(cleanBunkName))];
    expect(names.map(hebrewLetterNumber)).toEqual([32, 65, 56, 30, 16, 15, 14, 43, 19, 1, 60, 20, 64, 59]);
    expect([...names].sort(compareBunkNames)).toEqual(["Bunk א", "Bunk יד", "Bunk טו", "Bunk טז", "Bunk יט", "Bunk כ", "Bunk ל", "Bunk לב", "Bunk מג", "Bunk נו", "Bunk נט", "Bunk ס", "Bunk סד", "Bunk סה"]);
  });
});
