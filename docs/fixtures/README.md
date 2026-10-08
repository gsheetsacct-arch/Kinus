# Fixtures

- `export-sample.csv` — the registration export's header (30 columns) plus one
  synthetic camper row, as received. Used by the import unit tests. Real camper
  rows are deliberately not committed.
- The real sample had been re-saved in WPS, which replaced Hebrew with `?????`;
  the import's lost-text guard test should reproduce that case, and a
  Windows-1255 fixture should cover the recoverable ANSI case.
