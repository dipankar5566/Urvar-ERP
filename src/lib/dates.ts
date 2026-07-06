// Local-timezone date strings. toISOString() is UTC and rolls the date back
// before 05:30 IST, which mislabels mfg dates on early-morning batches.

export function localDateISO(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Render a stored UTC timestamp (ISO or sqlite "YYYY-MM-DD HH:MM:SS") in local time.
export function fmtDateTime(stored: string): string {
  const iso = stored.includes("T") ? stored : stored.replace(" ", "T") + "Z";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return stored;
  return `${localDateISO(d)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
