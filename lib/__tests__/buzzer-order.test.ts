import { describe, expect, it } from "vitest";

const c = (first_name: string, last_name: string, division: string | null, bunk: string | null) => ({ first_name, last_name, divisions: division ? { name: division } : null, bunks: bunk ? { name: bunk } : null });

describe("buzzer numbering order", () => {
  it("division 1, 2, 3, then the rest A–Z; bunks in Alef-Beis order; then last name", async () => {
    Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "x".repeat(16), SUPABASE_SERVICE_ROLE_KEY: "x".repeat(16) });
    const { byPlaceThenName } = await import("../buzzers");
    const campers = [
      c("A", "Levi", "Hebrew Division", "Bunk א"),
      c("B", "Cohen", "French Division", "Bunk א"),
      c("C", "Gold", "Bar Mitzvah Program", "Bunk ב"),
      c("D", "Adler", "Division 3", "Bunk יא"),
      c("E", "Katz", "Division 2", "Bunk י"),
      c("F", "Berg", "Division 2", "Bunk י"),
      c("G", "Stern", "Division 2", "Bunk ט"),
      c("H", "Zev", "Division 1", null),
      c("I", "Aaron", "Division 1", "Bunk ב"),
      c("J", "Nobody", null, null),
    ];
    expect([...campers].sort(byPlaceThenName).map((x) => x.last_name)).toEqual(["Aaron", "Zev", "Stern", "Berg", "Katz", "Adler", "Gold", "Cohen", "Levi", "Nobody"]);
  });
});
