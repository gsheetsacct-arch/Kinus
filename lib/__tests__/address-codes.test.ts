import { describe, expect, it } from "vitest";
import { addressColumn, countryName, stateCode } from "../address-codes";
import { mergeValues, sourceValues } from "../print/merge";
import { addressLine } from "../staff/export";

describe("states and countries, the same way on every tag", () => {
  it("states and provinces as their 2-letter code, however they were written", () => {
    for (const v of ["New York", "new york", "  NEW   YORK ", "NY", "ny", "N.Y.", "N Y"]) expect(stateCode(v), v).toBe("NY");
    expect(stateCode("New Jersey")).toBe("NJ");
    expect(stateCode("Washington DC")).toBe("DC");
    expect(stateCode("Washington, D.C.")).toBe("DC");
    expect(stateCode("Washington")).toBe("WA");
    expect(stateCode("California")).toBe("CA");
    expect(stateCode("Québec")).toBe("QC");
    expect(stateCode("Ontario")).toBe("ON");
    expect(stateCode("Florida ")).toBe("FL");
  });
  it("anything it doesn't know prints as typed", () => {
    expect(stateCode("Brooklyn")).toBe("Brooklyn");
    expect(stateCode("Gush Dan")).toBe("Gush Dan");
    expect(stateCode("XX")).toBe("XX");
    expect(stateCode("")).toBe("");
    expect(stateCode(null)).toBe("");
  });
  it("USA for the United States, UK for the United Kingdom, other countries as typed", () => {
    for (const v of ["United States", "united states of america", "US", "U.S.", "USA", "U.S.A.", "U S A", "America"]) expect(countryName(v), v).toBe("USA");
    expect(countryName("United Kingdom")).toBe("UK");
    expect(countryName("Israel")).toBe("Israel");
    expect(countryName("Canada")).toBe("Canada");
    expect(countryName(undefined)).toBe("");
  });
  it("knows which export columns hold a state or a country", () => {
    expect(addressColumn("family.state")).toBe(stateCode);
    expect(addressColumn("ppa#state")).toBe(stateCode);
    expect(addressColumn("family.country")).toBe(countryName);
    expect(addressColumn("family.city")).toBeNull();
    expect(addressColumn("ppa.statement")).toBeNull();
  });
});

describe("on a camper's tag", () => {
  const camper = { first_name: "Levi", last_name: "Cohen", source_data: { "family.city": "Brooklyn", "family.state": "New York", "family#country": "United States", "ppa.estate": "New York" } };
  it("{{family.state}} and {{family.country}} print as NY and USA; other columns as they are", () => {
    const get = sourceValues(camper as never);
    expect(get("family.state")).toBe("NY");
    expect(get("source.family.state")).toBe("NY");
    expect(get("family.country")).toBe("USA");
    expect(get("family.city")).toBe("Brooklyn");
    expect(get("ppa.estate")).toBe("New York");
  });
  it("a merge field made from the state column prints the code too", () => {
    const v = mergeValues(camper as never, [{ key: "STATE", label: "State", source_field: "source.family.state", transforms: [] }], new Map());
    expect(v.STATE).toBe("NY");
  });
});

describe("a staff member's address", () => {
  it("prints the same way", () => {
    expect(addressLine({ street: "4 Main Street", city: "Brooklyn", state: "New York", zip: "11213", country: "United States of America" })).toBe("4 Main Street, Brooklyn, NY 11213");
    expect(addressLine({ city: "Toronto", state: "Ontario", country: "Canada" })).toBe("Toronto, ON, Canada");
  });
});
