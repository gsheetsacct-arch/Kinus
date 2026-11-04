import { describe, expect, it } from "vitest";
import { matchStaffRows, type KnownPerson } from "../staff/match";

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const person = (id: string, o: Partial<KnownPerson> = {}): KnownPerson => ({ id, email: `no-email.${id}@x`, full_name: id, source_id: null, placeholder: true, ...o });

describe("matching a staff sheet to the staff in Kinus", () => {
  it("a counselor and their Thursday Program row (two ids) stay two people", () => {
    const people = [person("p1", { full_name: "Moshe Wallner", source_id: "KTH87-285" })];
    const m = matchStaffRows(
      [
        { name: "Moshe Wallner", email: "", sourceId: "KTH87-285" },
        { name: "Moshe Wallner", email: "", sourceId: "KTH87-347" },
      ],
      people,
      same,
    );
    expect(m.map((x) => x.existingId)).toEqual(["p1", null]);
  });
  it("the first time (nobody has an id yet): the first row takes the person, the second is new", () => {
    const m = matchStaffRows(
      [
        { name: "Moshe Wallner", email: "", sourceId: "KTH87-285" },
        { name: "Moshe Wallner", email: "", sourceId: "KTH87-347" },
      ],
      [person("p1", { full_name: "Moshe Wallner" })],
      same,
    );
    expect(m.map((x) => x.existingId)).toEqual(["p1", null]);
  });
  it("brothers with one family email are two people; the second comes in without the email", () => {
    const people = [person("p1", { full_name: "Yeshayahu Bukiet", email: "fam@x.com", placeholder: false, source_id: "15177" })];
    const m = matchStaffRows(
      [
        { name: "Yeshayahu Bukiet", email: "fam@x.com", sourceId: "15177" },
        { name: "Chaim Bukiet", email: "fam@x.com", sourceId: "15388" },
      ],
      people,
      same,
    );
    expect(m[0]).toMatchObject({ existingId: "p1", dropEmail: false });
    expect(m[1]).toMatchObject({ existingId: null, dropEmail: true });
  });
  it("still matches by email or name someone with no id yet", () => {
    const people = [person("a", { email: "a@x.com", placeholder: false }), person("b", { full_name: "Levi Cohen" })];
    const m = matchStaffRows(
      [
        { name: "A", email: "a@x.com", sourceId: "1" },
        { name: "Levi Cohen", email: "", sourceId: "2" },
      ],
      people,
      same,
    );
    expect(m.map((x) => x.existingId)).toEqual(["a", "b"]);
  });
});
