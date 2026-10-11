export const secureSession = (process.env.TRQSH_API_URL || "https://api.trqsh.uz").startsWith("https://") ||
  (process.env.NODE_ENV === "production" && process.env.TRQSH_ENV !== "development");

export const sessionCookieName = (name: string) => secureSession ? `__Host-${name}` : name;
export const oauthCookie = sessionCookieName("trqsh_oauth_browser");
