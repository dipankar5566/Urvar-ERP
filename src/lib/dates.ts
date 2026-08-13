// Local-timezone date strings. toISOString() is UTC and rolls the date back
// before 05:30 IST, which mislabels mfg dates on early-morning batches.

export function localDateISO(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Columns with a DB-generated default (createdAt, recordedAt, ...) are
// Postgres `timestamptz` read back as text (mode: "string" in schema.ts,
// chosen specifically to avoid every consumer of these fields needing to
// handle a native JS Date) — format is "YYYY-MM-DD HH:MM:SS.ffffff+TZ",
// space-separated, not ISO's "T". Columns the app itself writes (mfgDate,
// startedAt, ...) still use JS `toISOString()` ("...T...Z"). Normalize
// either into a real Date; also tolerates a bare "+00" offset (no minutes),
// which the JS Date constructor doesn't reliably parse on its own.
export function parseStoredDate(stored: string): Date {
  // Pure date, no time component (mfgDate/expiryDate/localDateISO() output)
  // — hand straight to Date before any offset-guessing runs, since a bare
  // "YYYY-MM-DD" string's trailing "-DD" would otherwise be misread as a
  // negative UTC offset by the checks below.
  if (/^\d{4}-\d{2}-\d{2}$/.test(stored)) return new Date(stored);

  let s = stored.includes("T") ? stored : stored.replace(" ", "T");
  if (!/[zZ]$/.test(s) && !/[+-]\d{2}:\d{2}$/.test(s)) {
    s = /[+-]\d{2}$/.test(s) ? `${s}:00` : `${s}Z`;
  }
  return new Date(s);
}

// Render a stored UTC timestamp (ISO or sqlite "YYYY-MM-DD HH:MM:SS") in local time.
export function fmtDateTime(stored: string): string {
  const d = parseStoredDate(stored);
  if (isNaN(d.getTime())) return stored;
  return `${localDateISO(d)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
