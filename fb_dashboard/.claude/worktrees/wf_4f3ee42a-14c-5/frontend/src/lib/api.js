const BASE = ""; // relative to same domain in prod

async function api(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: opts.body instanceof FormData ? {} : { "Content-Type": "application/json", ...opts.headers },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text.slice(0, 200));
  }
  return res.json();
}

export function fetchStats() {
  return api("/api/stats");
}

export function fetchRules() {
  return api("/api/rules");
}

export function createRule(name, keywords, reply_template, description, bot_type = "reply", dm_template = "") {
  const fd = new FormData();
  fd.append("name", name);
  fd.append("keywords", keywords);
  fd.append("reply_template", reply_template);
  fd.append("description", description || "");
  fd.append("bot_type", bot_type);
  if (dm_template) fd.append("dm_template", dm_template);
  return api("/api/rules", { method: "POST", body: fd });
}

export function updateRule(id, name, keywords, reply_template, description, bot_type = "reply", dm_template = "") {
  const fd = new FormData();
  fd.append("name", name);
  fd.append("keywords", keywords);
  fd.append("reply_template", reply_template);
  fd.append("description", description || "");
  fd.append("bot_type", bot_type);
  if (dm_template) fd.append("dm_template", dm_template);
  return api(`/api/rules/${id}`, { method: "PUT", body: fd });
}

export function deleteRule(id) {
  return api(`/api/rules/${id}`, { method: "DELETE" });
}

export function toggleRule(id) {
  return api(`/api/rules/${id}/toggle`, { method: "POST" });
}

export function fetchReplies(page = 1, perPage = 20, search = "") {
  const params = new URLSearchParams({ page, per_page: perPage });
  if (search) params.set("search", search);
  return api(`/api/replies?${params}`);
}

export function fetchPosts() {
  return api("/api/posts");
}

export function publishPost(message) {
  const fd = new FormData();
  fd.append("message", message);
  return api("/api/publish", { method: "POST", body: fd });
}

export function fetchBotStatus() {
  return api("/api/bot/status");
}

export function restartBot() {
  return api("/api/bot/restart", { method: "POST" });
}

export function fetchLogs(limit = 50) {
  return api(`/api/logs?limit=${limit}`);
}

export function fetchFacebookSettings() {
  return api("/api/facebook/settings");
}

export function updateFacebookSettings(data) {
  return api("/api/facebook/settings", { method: "PUT", body: JSON.stringify(data) });
}

export function fetchPostDetail(postId) {
  return api(`/api/posts/${postId}`);
}

export function deletePost(postId) {
  return api(`/api/posts/${postId}`, { method: "DELETE" });
}

export function fetchConversations() {
  return api("/api/messages");
}

export function fetchConversationMessages(conversationId) {
  return api(`/api/messages/${conversationId}`);
}

export function replyToComment(commentId, message) {
  const fd = new FormData();
  fd.append("message", message);
  return api(`/api/replies/${commentId}/reply`, { method: "POST", body: fd });
}

export function fetchAdAccounts() {
  return api("/api/ads/accounts");
}

export function fetchCampaigns(accountId) {
  return api(`/api/ads/campaigns/${accountId}`);
}

// ---- Auth ----
export function login(username, password) {
  const fd = new FormData();
  fd.append("username", username);
  fd.append("password", password);
  return api("/api/login", { method: "POST", body: fd });
}

export function logout() {
  return api("/api/logout", { method: "POST" });
}

export function fetchMe() {
  return api("/api/me");
}

// ---- Users ----
export function fetchUsers() {
  return api("/api/users");
}

export function createUser(username, password, role) {
  const fd = new FormData();
  fd.append("username", username);
  fd.append("password", password);
  fd.append("role", role);
  return api("/api/users", { method: "POST", body: fd });
}

export function updateUser(id, role, password = "") {
  const fd = new FormData();
  fd.append("role", role);
  if (password) fd.append("password", password);
  return api(`/api/users/${id}`, { method: "PUT", body: fd });
}

// ---- Settings ----
export function fetchEnv() {
  return api("/api/env");
}
export function fetchSystemStats() {
  return api("/api/system/stats");
}
export function clearLogs(days = 30) {
  return api("/api/logs/clear", { method: "POST", body: JSON.stringify({ days }) });
}

// ---- Webhook ----
export function fetchWebhookCheck() {
  return api("/api/webhook/check");
}
export function fetchWebhookEvents(limit = 20) {
  return api(`/api/webhook/events?limit=${limit}`);
}
export function triggerWebhookTest() {
  return api("/api/webhook/test", { method: "POST" });
}
