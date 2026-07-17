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

export function fetchReplies(page = 1, perPage = 20, search = "", ruleId = "") {
  const params = new URLSearchParams({ page, per_page: perPage });
  if (search) params.set("search", search);
  if (ruleId) params.set("rule_id", ruleId);
  return api(`/api/replies?${params}`);
}

export function fetchHourlyStats() {
  return api("/api/stats/hourly");
}

export function fetchPosts(page = 1, perPage = 10) {
  const params = new URLSearchParams({ page, per_page: perPage });
  return api(`/api/posts?${params}`);
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

// ── Comments Hub ──
export function fetchAllComments(limit = 20) {
  return api(`/api/comments?limit=${limit}`);
}
export function hideComment(commentId) {
  return api(`/api/comments/${commentId}/hide`, { method: "POST" });
}
export function deleteComment(commentId) {
  return api(`/api/comments/${commentId}`, { method: "DELETE" });
}

export function replyToConversation(conversationId, message) {
  const fd = new FormData();
  fd.append("message", message);
  return api(`/api/messages/${conversationId}/reply`, { method: "POST", body: fd });
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

// ---- AI ----
export function fetchAiStatus() {
  return api("/api/ai/status");
}
export function suggestAiReplies(commentText, commenterName = "", pageContext = "") {
  const fd = new FormData();
  fd.append("comment_text", commentText);
  if (commenterName) fd.append("commenter_name", commenterName);
  if (pageContext) fd.append("page_context", pageContext);
  return api("/api/ai/suggest", { method: "POST", body: fd });
}
export function analyzeComment(commentText) {
  const fd = new FormData();
  fd.append("comment_text", commentText);
  return api("/api/ai/analyze", { method: "POST", body: fd });
}

// ---- Inbox ----
export function fetchInboxConversations(status = "all", tag = "", search = "", page = 1, perPage = 25) {
  const params = new URLSearchParams({ status, page, per_page: perPage });
  if (tag) params.set("tag", tag);
  if (search) params.set("search", search);
  return api(`/api/inbox/conversations?${params}`);
}
export function fetchInboxMessages(conversationId) {
  return api(`/api/inbox/conversations/${conversationId}`);
}
export function replyToInbox(conversationId, message) {
  const fd = new FormData();
  fd.append("message", message);
  return api(`/api/inbox/conversations/${conversationId}/reply`, { method: "POST", body: fd });
}

// ---- Inbox Tags ----
export function fetchInboxTags() {
  return api("/api/inbox/tags");
}
export function createInboxTag(name, color) {
  const fd = new FormData(); fd.append("name", name); fd.append("color", color);
  return api("/api/inbox/tags", { method: "POST", body: fd });
}
export function deleteInboxTag(tagId) {
  return api(`/api/inbox/tags/${tagId}`, { method: "DELETE" });
}
export function assignTagToConversation(convId, tagId) {
  const fd = new FormData(); fd.append("tag_id", tagId);
  return api(`/api/inbox/conversations/${convId}/tags`, { method: "POST", body: fd });
}
export function removeTagFromConversation(convId, tagId) {
  return api(`/api/inbox/conversations/${convId}/tags/${tagId}`, { method: "DELETE" });
}

// ---- Reply Templates ----
export function fetchTemplates(category = "") {
  const params = category ? `?category=${category}` : "";
  return api(`/api/templates${params}`);
}
export function createTemplate(name, text, category = "general", shortcut = "") {
  const fd = new FormData(); fd.append("name", name); fd.append("text", text);
  fd.append("category", category); fd.append("shortcut", shortcut);
  return api("/api/templates", { method: "POST", body: fd });
}
export function updateTemplate(id, name, text, category = "general", shortcut = "") {
  const fd = new FormData(); fd.append("name", name); fd.append("text", text);
  fd.append("category", category); fd.append("shortcut", shortcut);
  return api(`/api/templates/${id}`, { method: "PUT", body: fd });
}
export function deleteTemplate(id) {
  return api(`/api/templates/${id}`, { method: "DELETE" });
}

// ---- Scheduled Posts ----
export function fetchScheduledPosts(status = "") {
  const params = status ? `?status=${status}` : "";
  return api(`/api/scheduled-posts${params}`);
}
export function createScheduledPost(message, imageUrl = "", scheduledAt = "") {
  const fd = new FormData(); fd.append("message", message);
  if (imageUrl) fd.append("image_url", imageUrl);
  if (scheduledAt) fd.append("scheduled_at", scheduledAt);
  return api("/api/scheduled-posts", { method: "POST", body: fd });
}
export function publishScheduledPost(postId) {
  return api(`/api/scheduled-posts/${postId}/publish`, { method: "POST" });
}
export function deleteScheduledPost(postId) {
  return api(`/api/scheduled-posts/${postId}`, { method: "DELETE" });
}

// ---- Analytics ----
export function fetchAnalyticsOverview(days = 30) {
  return api(`/api/analytics/overview?days=${days}`);
}
export function exportAnalytics(format = "csv", days = 30) {
  return api(`/api/analytics/export?format=${format}&days=${days}`);
}

// ---- Widgets ----
export function fetchRecentActivity(limit = 10) {
  return api(`/api/widgets/recent-activity?limit=${limit}`);
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

export function register(username, password, email = "", companyName = "") {
  const fd = new FormData();
  fd.append("username", username);
  fd.append("password", password);
  if (email) fd.append("email", email);
  if (companyName) fd.append("company_name", companyName);
  return api("/api/register", { method: "POST", body: fd });
}

export function logout() {
  return api("/api/logout", { method: "POST" });
}

export function fetchMe() {
  return api("/api/me");
}

// ---- Registration & Subscription ----
export function fetchPlans() {
  return api("/api/plans");
}

export function fetchSubscription() {
  return api("/api/tenant/subscription");
}

export function createCheckoutSession(planId) {
  return api("/api/tenant/checkout", { method: "POST", body: JSON.stringify({ plan_id: planId }) });
}

export function fetchPaymentHistory() {
  return api("/api/tenant/payments");
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

export function deleteUser(id) {
  return api(`/api/users/${id}`, { method: "DELETE" });
}

// ── Flows API ──
export function fetchFlows() {
  return api("/api/flows");
}
export function createFlow(data) {
  return api("/api/flows", { method: "POST", body: JSON.stringify(data) });
}
export function updateFlow(id, data) {
  return api(`/api/flows/${id}`, { method: "PUT", body: JSON.stringify(data) });
}
export function deleteFlow(id) {
  return api(`/api/flows/${id}`, { method: "DELETE" });
}
export function toggleFlow(id) {
  return api(`/api/flows/${id}/toggle`, { method: "POST" });
}
export function fetchFlow(id) {
  return api(`/api/flows/${id}`);
}

// ── Sequences API ──
export function fetchSequences() {
  return api("/api/sequences");
}
export function createSequence(data) {
  return api("/api/sequences", { method: "POST", body: JSON.stringify(data) });
}
export function updateSequence(id, data) {
  return api(`/api/sequences/${id}`, { method: "PUT", body: JSON.stringify(data) });
}
export function deleteSequence(id) {
  return api(`/api/sequences/${id}`, { method: "DELETE" });
}
export function fetchSequence(id) {
  return api(`/api/sequences/${id}`);
}
export function addSequenceStep(seqId, data) {
  return api(`/api/sequences/${seqId}/steps`, { method: "POST", body: JSON.stringify(data) });
}
export function updateSequenceStep(stepId, data) {
  return api(`/api/sequences/steps/${stepId}`, { method: "PUT", body: JSON.stringify(data) });
}
export function deleteSequenceStep(stepId) {
  return api(`/api/sequences/steps/${stepId}`, { method: "DELETE" });
}

// ── Broadcasts API ──
export function fetchBroadcasts() {
  return api("/api/broadcasts");
}
export function createBroadcast(data) {
  return api("/api/broadcasts", { method: "POST", body: JSON.stringify(data) });
}
export function sendBroadcast(id) {
  return api(`/api/broadcasts/${id}/send`, { method: "POST" });
}
export function cancelBroadcast(id) {
  return api(`/api/broadcasts/${id}/cancel`, { method: "POST" });
}
export function deleteBroadcast(id) {
  return api(`/api/broadcasts/${id}`, { method: "DELETE" });
}
export function estimateAudience(filters) {
  return api("/api/broadcasts/estimate", { method: "POST", body: JSON.stringify(filters) });
}

// ── Subscribers API ──
export function fetchSubscribers(params = {}) {
  const q = new URLSearchParams();
  if (params.search) q.set("search", params.search);
  if (params.platform) q.set("platform", params.platform);
  if (params.tag) q.set("tag", params.tag);
  if (params.page) q.set("page", params.page);
  if (params.per_page) q.set("per_page", params.per_page);
  const qs = q.toString();
  return api(`/api/subscribers${qs ? `?${qs}` : ""}`);
}
export function fetchSubscriber(id) {
  return api(`/api/subscribers/${id}`);
}
export function tagSubscriber(subId, tagId) {
  return api(`/api/subscribers/${subId}/tags`, { method: "POST", body: JSON.stringify({ tag_id: tagId }) });
}
export function untagSubscriber(subId, tagId) {
  return api(`/api/subscribers/${subId}/tags/${tagId}`, { method: "DELETE" });
}

// ── Tags API ──
export function fetchTags() {
  return api("/api/tags");
}
export function createTag(name, color) {
  return api("/api/tags", { method: "POST", body: JSON.stringify({ name, color }) });
}
export function deleteTag(id) {
  return api(`/api/tags/${id}`, { method: "DELETE" });
}

// ── Analytics API ──
export function fetchDailyTrend(days) {
  return api(`/api/analytics/daily-trend?days=${days}`);
}
export function fetchHourlyHeatmap(days) {
  return api(`/api/analytics/hourly-heatmap?days=${days}`);
}
export function fetchTopRules(days, limit = 10) {
  return api(`/api/analytics/top-rules?days=${days}&limit=${limit}`);
}
export function fetchSentimentTrend(days) {
  return api(`/api/analytics/sentiment-trend?days=${days}`);
}
export function fetchPeakHour(days) {
  return api(`/api/analytics/peak-hour?days=${days}`);
}
export function fetchTopCommenters(days, limit = 10) {
  return api(`/api/analytics/top-commenters?days=${days}&limit=${limit}`);
}
export function fetchPeriodComparison(days) {
  return api(`/api/analytics/period-comparison?days=${days}`);
}

// ── Content Calendar API ──
export function fetchCalendarPosts(year, month) {
  return api(`/api/calendar?year=${year}&month=${month}`);
}
export function fetchDayPosts(year, month, day) {
  return api(`/api/calendar/day?year=${year}&month=${month}&day=${day}`);
}
export function createCalendarPost(data) {
  return api("/api/calendar", { method: "POST", body: JSON.stringify(data) });
}
export function updateCalendarPost(id, data) {
  return api(`/api/calendar/${id}`, { method: "PUT", body: JSON.stringify(data) });
}
export function deleteCalendarPost(id) {
  return api(`/api/calendar/${id}`, { method: "DELETE" });
}
export function publishCalendarPost(id) {
  return api(`/api/calendar/${id}/publish`, { method: "POST" });
}
export function fetchMonthSummary(year, month) {
  return api(`/api/calendar/month-summary?year=${year}&month=${month}`);
}

// ── Team API ──
export function fetchTeamMembers() {
  return api("/api/team/members");
}
export function fetchTeamActivity(days = 7) {
  return api(`/api/team/activity?days=${days}`);
}
export function fetchTeamPerformance() {
  return api("/api/team/performance");
}
export function fetchRoleSummary() {
  return api("/api/team/role-summary");
}

// ── Offers ──
export function fetchOffers(activeOnly = false) {
  return api(`/api/offers?active_only=${activeOnly}`);
}
export function createOffer(title, code = "", description = "", discountValue = 0, expiresAt = "") {
  const fd = new FormData(); fd.append("title", title); fd.append("code", code);
  fd.append("description", description); fd.append("discount_value", discountValue);
  if (expiresAt) fd.append("expires_at", expiresAt);
  return api("/api/offers", { method: "POST", body: fd });
}
export function toggleOffer(id) {
  return api(`/api/offers/${id}/toggle`, { method: "POST" });
}
export function deleteOffer(id) {
  return api(`/api/offers/${id}`, { method: "DELETE" });
}

// ── Dashboard Bundle ──
export function fetchDashboardBundle() {
  return api("/api/dashboard/bundle");
}

// ── Facebook Insights ──
export function fetchFacebookInsights(days = 7) {
  return api(`/api/facebook/insights?days=${days}`);
}

// ── Logs & Diagnostics ──
export function fetchLogStream(level = "", module = "", since = "", limit = 100) {
  const params = new URLSearchParams({ limit });
  if (level) params.set("level", level);
  if (module) params.set("module", module);
  if (since) params.set("since", since);
  return api(`/api/logs/stream?${params}`);
}
export function fetchLogStats() {
  return api("/api/logs/stats");
}
// ── Publisher stubs (needed by pages/publisher.jsx) ──
export function fetchPublisherStatus() { return api("/api/publisher/status") }
export function configurePublisher(data) { return api("/api/publisher/configure", { method:"POST", body:data }) }
export function publishToPlatform(platform, message, imageUrl) { return api("/api/publisher/publish", { method:"POST", body:{platform,message,image_url:imageUrl} }) }
export function fetchPlatformSettings(platform) { return api(`/api/publisher/settings?platform=${platform}`) }

// ── CRM ──
export function fetchCrmCustomers(params = {}) {
  const q = new URLSearchParams()
  if (params.stage) q.set("stage", params.stage)
  if (params.search) q.set("search", params.search)
  if (params.page) q.set("page", params.page)
  if (params.per_page) q.set("per_page", params.per_page)
  const qs = q.toString()
  return api("/api/crm/customers" + (qs ? "?" + qs : ""))
}

// ── Diagnostics ──
export function fetchDiagnosticsStatus() {
  return api("/api/diagnostics/status");
}
export function fetchHealthAlerts() {
  return api("/api/health/alerts");
}
export function fetchDiagnosticsPermissions() {
  return api("/api/diagnostics/permissions");
}
export function postDemoTestComment(commentText) {
  const fd = new FormData();
  fd.append("comment_text", commentText);
  return api("/api/diagnostics/demo-test-comment", { method: "POST", body: fd });
}
