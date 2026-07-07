// Local-timezone date strings. toISOString() is UTC and rolls the date back
// before 05:30 IST, which mislabels mfg dates on early-morning batches.

export function localDateISO(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Stored timestamps come in two formats in this app: JS `toISOString()`
// ("...T...Z") and SQLite's `datetime('now')` default ("YYYY-MM-DD HH:MM:SS",
// no T, no Z, implicitly UTC). Normalize either into a real Date.
export function parseStoredDate(stored: string): Date {
  const iso = stored.includes("T") ? stored : stored.replace(" ", "T") + "Z";
  return new Date(iso);
}

// Render a stored UTC timestamp (ISO or sqlite "YYYY-MM-DD HH:MM:SS") in local time.
export function fmtDateTime(stored: string): string {
  const d = parseStoredDate(stored);
  if (isNaN(d.getTime())) return stored;
  return `${localDateISO(d)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
