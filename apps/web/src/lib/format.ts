// Shared display helpers for the dashboard. Every one of these takes a real
// stored value and only changes how it reads — none of them invent a value
// when the underlying column is null, they return a dash instead.

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  // Locale and timeZone are pinned explicitly (not left to the runtime
  // default) so this renders identically during SSR and during client
  // hydration. An implicit local timezone/locale differs between the
  // Node server (container timezone) and the browser (viewer's own
  // timezone), which was producing a real hydration mismatch.
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  // Same fix as formatDate above -- pinned locale + timeZone so the server
  // render and the client hydration render produce the identical string
  // instead of each rendering in its own environment's local timezone.
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

const RELATIVE_STEPS: Array<[limitSeconds: number, divisor: number, unit: Intl.RelativeTimeFormatUnit]> = [
  [60, 1, "second"],
  [3600, 60, "minute"],
  [86400, 3600, "hour"],
  [604800, 86400, "day"],
  [2629800, 604800, "week"],
  [31557600, 2629800, "month"],
  [Infinity, 31557600, "year"],
];

export function formatRelative(iso: string | null | undefined) {
  if (!iso) return "—";

  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";

  const diffSeconds = (then - Date.now()) / 1000;
  const abs = Math.abs(diffSeconds);
  if (abs < 45) return "Just now";

  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [limit, divisor, unit] of RELATIVE_STEPS) {
    if (abs < limit) {
      return formatter.format(Math.round(diffSeconds / divisor), unit);
    }
  }
  return "—";
}

export function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}
