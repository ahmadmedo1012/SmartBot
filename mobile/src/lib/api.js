const BASE = "https://smartbot-6lxo.onrender.com";

async function api(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts.headers },
    credentials: "include",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text.slice(0, 200));
  }
  return res.json();
}

export async function login(username, password) {
  const fd = new FormData();
  fd.append("username", username);
  fd.append("password", password);
  const res = await fetch(`${BASE}/api/login`, {
    method: "POST", body: fd, credentials: "include",
  });
  if (!res.ok) throw new Error("Login failed");
  return res.json();
}

export async function fetchStats() { return api("/api/stats"); }
export async function fetchFlows() { return api("/api/flows"); }
export async function fetchRules() { return api("/api/rules"); }
export async function fetchAnalytics(days) { return api(`/api/analytics/dashboard?days=${days}`); }
export async function fetchSubscribers() { return api("/api/subscribers"); }
export async function fetchInbox() { return api("/api/inbox/stats"); }
export async function fetchEnv() { return api("/api/env"); }

export default api;
