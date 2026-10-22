// Formatting helpers shared with web/dashboard (kept in sync so numbers read the
// same across the product).

/** Human-readable byte size (binary units), e.g. 10737418240 -> "10 GB". */
export function formatBytes(n: number): string {
  if (!n || n < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  // Rounding can carry a value up to the next unit ("1024 KB"); promote it so
  // the figure reads "1 MB" instead.
  if (i < units.length - 1 && Math.round((n / Math.pow(1024, i)) * 10) / 10 >= 1024) i++;
  const v = n / Math.pow(1024, i);
  // Whole values read cleaner in marketing copy ("10 GB", not "10.0 GB").
  const s = v >= 100 || i === 0 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, "");
  return `${s} ${units[i]}`;
}

/** Compact number, e.g. 12500 -> "12.5K", 999999 -> "1M". */
export function formatNumber(n: number): string {
  if (n < 1000) return String(n);
  const units = ["", "K", "M", "B"];
  let i = Math.min(Math.floor(Math.log10(n) / 3), units.length - 1);
  if (i < units.length - 1 && Math.round((n / Math.pow(1000, i)) * 10) / 10 >= 1000) i++;
  const v = n / Math.pow(1000, i);
  return `${v >= 100 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, "")}${units[i]}`;
}

/** Cents -> "$8" / "$8.50". */
export function formatPrice(cents: number): string {
  if (!cents) return "$0";
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

/** Go time.Duration (nanoseconds) -> human retention string, e.g. "30 days". */
export function formatRetention(ns: number): string {
  const hours = ns / 3.6e12;
  if (hours >= 24) return `${Math.round(hours / 24)} days`;
  if (hours >= 1) return `${Math.round(hours)} hour${hours === 1 ? "" : "s"}`;
  return "1 hour";
}
