// Same-origin client for /admin/* and /v1/admin/*. The session cookie is HttpOnly;
// the only secret JavaScript holds is the CSRF token, which every state-changing
// request echoes back in X-CSRF-Token.

let csrf = "";
export const hooks = { onExpire: () => {} };

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request(method, path, body, { quiet = false } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (csrf) headers["X-CSRF-Token"] = csrf;
  let res;
  try {
    res = await fetch(path, { method, headers, credentials: "same-origin", cache: "no-store", body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, "Can't reach the API. Check your connection.");
  }
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      /* gateway errors are often HTML */
    }
  }
  if (res.status === 401 && !quiet) hooks.onExpire();
  if (!res.ok) {
    throw new ApiError(res.status, (data && data.error) || res.statusText || `Request failed (${res.status})`);
  }
  if (data && data.csrf_token) csrf = data.csrf_token;
  return data;
}

function withQuery(path, params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

export const api = {
  get: (path, params) => request("GET", withQuery(path, params)),
  post: (path, body) => request("POST", path, body ?? undefined),
  patch: (path, body) => request("PATCH", path, body),
  del: (path, params) => request("DELETE", withQuery(path, params)),
};

export const session = {
  async login(username, password) {
    await request("POST", "/admin/login", { username, password }, { quiet: true });
  },
  async resume() {
    await request("GET", "/v1/admin/session", undefined, { quiet: true });
  },
  async logout() {
    try {
      await request("POST", "/admin/logout", undefined, { quiet: true });
    } finally {
      csrf = "";
    }
  },
};

export const A = "/v1/admin";
