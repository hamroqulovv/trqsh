export function formatReleaseDate(value: string, month: "short" | "long" = "short") {
  return new Intl.DateTimeFormat("en-US", {
    month, day: "numeric", year: "numeric", timeZone: "UTC",
  }).format(new Date(value));
}
