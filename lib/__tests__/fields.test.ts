import { describe, expect, it } from "vitest";
import { groupOfKey } from "@/lib/fields";

describe("groupOfKey", () => {
  it("uses the field's own group", () => {
    expect(groupOfKey("first_name")).toBe("basic");
    expect(groupOfKey("medical_notes")).toBe("medical");
    expect(groupOfKey("contact.mother.phone")).toBe("contacts");
  });
  it("treats sensitive-looking registration columns as gated", () => {
    expect(groupOfKey("source.ppa.medical_conditions")).toBe("medical");
    expect(groupOfKey("source.PPA#Allergies")).toBe("medical");
    expect(groupOfKey("source.ppa.home_address")).toBe("address");
    expect(groupOfKey("source.ppa.mother_cell")).toBe("contacts");
  });
  it("leaves names and home town alone", () => {
    expect(groupOfKey("source.ppa.hebrew_last_name")).toBe("basic");
    expect(groupOfKey("source.ppa.city")).toBe("basic");
    expect(groupOfKey("source.ppa.yarmulka_size")).toBe("basic");
  });
});
