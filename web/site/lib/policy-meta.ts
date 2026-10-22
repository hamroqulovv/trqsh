// Plain data about the legal pages, kept apart from their JSX text so the
// sitemap can read the review date without loading every policy.

/** Date (YYYY-MM-DD) the policies were last reviewed. Update it with the text. */
export const policyUpdatedOn = "2026-10-20";

export const policyLinks = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms of service" },
  { href: "/cookies", label: "Cookies & storage" },
  { href: "/acceptable-use", label: "Acceptable use" },
] as const;
