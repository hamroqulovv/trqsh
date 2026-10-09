// Next Link/router add basePath themselves; fetch and EventSource need it too.
export const dashboardBasePath = process.env.NEXT_PUBLIC_TRQSH_DASHBOARD_BASE_PATH || "";

export function dashboardPath(path: string): string {
  return `${dashboardBasePath}${path}`;
}

export function safeDashboardNextPath(path: string): string {
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") ? path : "/";
}

// redirect() does not add basePath to a normal HTML form's Location header.
// An absolute same-origin URL also avoids applying basePath twice when Next
// handles the same action through its client-side RSC redirect flow.
export function dashboardRedirectURL(path: string): string {
  if (!dashboardBasePath) return path;
  const origin = new URL(process.env.TRQSH_API_URL || "https://trqsh.uz").origin;
  return `${origin}${dashboardPath(path)}`;
}
