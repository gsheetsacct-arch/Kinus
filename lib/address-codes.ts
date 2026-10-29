/**
 * States and countries the same way on every tag, whatever the form said: "New York",
 * "new york", "N.Y." → NY; "United States", "US", "U.S.A." → USA. Anything not recognised
 * prints as it was typed.
 */

const STATES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE",
  "district of columbia": "DC", "washington dc": "DC", "washington d c": "DC", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID",
  illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND",
  ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
  tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI",
  wyoming: "WY", "puerto rico": "PR", guam: "GU", "virgin islands": "VI", "us virgin islands": "VI", "american samoa": "AS",
  "northern mariana islands": "MP",
  // Canada
  alberta: "AB", "british columbia": "BC", manitoba: "MB", "new brunswick": "NB", "newfoundland and labrador": "NL", newfoundland: "NL",
  "nova scotia": "NS", ontario: "ON", "prince edward island": "PE", quebec: "QC", saskatchewan: "SK", "northwest territories": "NT",
  nunavut: "NU", yukon: "YT",
};
const CODES = new Set(Object.values(STATES));

const COUNTRIES: Record<string, string> = {
  "united states": "USA", "united states of america": "USA", usa: "USA", us: "USA", america: "USA", "the united states": "USA",
  "the united states of america": "USA",
  "united kingdom": "UK", uk: "UK", "great britain": "UK", england: "UK", "the united kingdom": "UK",
};

// "N.Y." → "ny", "  New   York " → "new york", "Québec" → "quebec"
const key = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** A state or province as its 2-letter code (NY, CA, ON…); anything else as it was typed. */
export function stateCode(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  if (!v) return "";
  const k = key(v);
  if (STATES[k]) return STATES[k];
  const compact = k.replace(/\s/g, "").toUpperCase();
  return compact.length === 2 && CODES.has(compact) ? compact : v;
}

/** USA for the United States (however it was written), UK for the United Kingdom; other countries as typed. */
export function countryName(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  if (!v) return "";
  const k = key(v);
  return COUNTRIES[k] ?? COUNTRIES[k.replace(/\s/g, "")] ?? v;
}

/** An export column holding a state or a country ("family.state", "ppa#country"), and how it prints. */
export function addressColumn(column: string): ((v: string) => string) | null {
  const last = column.trim().toLowerCase().split(/[.#]/).pop() ?? "";
  if (last === "state" || last === "province" || last === "state_province") return stateCode;
  if (last === "country") return countryName;
  return null;
}
