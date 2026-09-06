/**
 * Shared API entity types (v9-W2b) — single source for dashboard data typing.
 *
 * Every interface below is extracted from the REAL backend serializers
 * (fb_dashboard/routers/*.py + *_engine.py / content_calendar.py) and the
 * fields the dashboard pages actually consume. Conventions:
 *   - `?` marks a field the serializer may omit/null OR that only some
 *     endpoints send — kept optional so pages reading it keep compiling.
 *   - No index-signature escape hatches: pages only touch listed fields.
 *   - strictNullChecks is OFF today; fields the backend can send as JSON
 *     null are `| null` so flipping the flag on later needs no churn.
 *   - Generic defaults in lib/api.ts stay `any` (opt-in typing per call
 *     site); pages opt in here via `unwrapApi<Entity[]>`.
 */

// ── Envelope helpers ────────────────────────────────────────────────────────

/** Body of a failed API call — `ApiError.body` / raw `{detail|error}` payloads. */
export interface ApiErrorBody {
  detail?: string
  error?: string
}

/** Standard paginated envelope returned by the list endpoints. */
export interface Paginated<T> {
  items: T[]
  total: number
  page?: number
  per_page?: number
}

// ── Users / team ────────────────────────────────────────────────────────────

/** User row as sent by /api/me (`data.user`) and /api/team/members. */
export interface ApiUser {
  id: number
  username: string
  /** Display name — /api/me sends it (email or username); team list does not. */
  name?: string
  /** Owning tenant — 0 = platform (bootstrap) admin, > 0 = tenant member.
   *  Sent by /api/me and /api/login; the team list serializer does not. */
  tenant_id?: number
  /** /api/me sends it; the team list serializer does not */
  email?: string | null
  /** /api/me sends "" when unset. */
  phone?: string
  role?: string
  created_at?: string
  /** team-members only — reply-count proxy via BotLog mentions */
  replies_count?: number
  last_active?: string | null
  /** Tenant plan from /api/me ("free" | …). camelCase inherited from the
   *  backend serializer — one of only two camelCase fields in the whole API
   *  (with onboardingCompleted); documented quirk, kept as-sent. */
  subscriptionStatus?: string
  /** Reserved permissions list from /api/me (currently always []). */
  permissions?: string[]
  /** Role label from /api/me (mirrors `role` today). */
  roleLabel?: string
  /** Onboarding wizard completion flag from /api/me (camelCase — see
   *  subscriptionStatus). AuthGuard consumes it to re-show the wizard. */
  onboardingCompleted?: boolean
}

/** GET /api/me full response — the ONLY endpoint whose {success, data}
 *  envelope carries an extra `authenticated` sibling next to `data`
 *  (documented by the v10 S2 api-contract audit; every other endpoint
 *  sticks to the standard {success, data} shape). */
export interface MeEnvelope {
  success: boolean
  /** Non-standard envelope sibling — `true` on a 200 /api/me. */
  authenticated?: boolean
  data: { user: ApiUser }
}

// ── Inbox (conversations & messages) ────────────────────────────────────────

/** Participant of a conversation (inbox_list "senders[]"). (v10-W4: export dropped — nested in Conversation only) */
interface ConversationSender {
  id?: string
  name?: string
}

/** Tag attached to a conversation (inbox_list "tags[]"). (v10-W4: export dropped — nested in Conversation/Subscriber only) */
interface ConversationTag {
  id: number
  name: string
  color?: string
}

/** Row of /api/inbox/conversations → data.items (DB-first legacy shape). */
export interface Conversation {
  /** Facebook conversation id (string) */
  id: string
  subject?: string
  senders?: ConversationSender[]
  message_count?: number
  unread_count?: number
  updated_time?: string | null
  tags?: ConversationTag[]
}

/** Response of GET /api/inbox/conversations. */
export interface ConversationList extends Paginated<Conversation> {
  source?: string
}

/** Row of GET /api/inbox/conversations/{id} (thread of one conversation). */
export interface Message {
  /** fb_message_id or DB id (string on the DB path, Graph id on the live path) */
  id?: string | number
  message?: string
  from?: { id?: string; name?: string }
  /** explicit page-vs-customer flag (v4 §2.4 — from.id checks never matched) */
  is_from_page?: boolean
  attachment_type?: string
  attachment_url?: string
  postback_payload?: string
  created_time?: string
}

// ── Auto-reply rules ────────────────────────────────────────────────────────

/** Row of /api/rules (rules.py serializer). */
export interface ReplyRule {
  id: number
  name: string
  keywords: string[]
  reply_template: string
  enabled?: boolean
  priority?: number
  replies_count?: number
  description?: string
}

// ── Comments ────────────────────────────────────────────────────────────────

/** Row of /api/comments → data.items (replies.py DB path). */
export interface CommentRow {
  /** fb_comment_id or stringified DB id — used as Record key in the UI */
  id: string
  message?: string
  from_name?: string
  from_id?: string
  created_time?: string
  post_id?: string
  post_message?: string
  replied_at?: string | null
  /** null until a reply exists — gates the reply form vs. the sent reply */
  reply_text?: string | null
}

// ── Broadcast (campaign) rows ───────────────────────────────────────────────

/** Row of /api/broadcasts (broadcast_engine.list_broadcasts). */
export interface BroadcastRow {
  id: number
  name?: string
  status?: string
  total_recipients?: number
  sent_count?: number
  failed_count?: number
  opened_count?: number
  created_by?: string
  created_at?: string | null
  sent_at?: string | null
  /** UI reads it with a created_at fallback; the engine sends sent_at */
  scheduled_at?: string | null
}

// ── Tools: offers & reply templates ─────────────────────────────────────────

/** Row of /api/offers (offers_routes serializer). */
export interface Offer {
  id: number
  title: string
  code?: string
  description?: string
  discount_type?: string
  discount_value?: number
  max_uses?: number | null
  used_count?: number
  auto_reply_rule_id?: number | null
  is_active?: boolean
  expires_at?: string | null
}

/** Row of /api/templates (templates_routes serializer). */
export interface ReplyTemplate {
  id: number
  name: string
  text: string
  category?: string
  shortcut?: string
}

// ── Audience: subscribers & CRM customers ───────────────────────────────────

/** Row of /api/subscribers → data.items (subscriber_engine.search). */
export interface Subscriber {
  id: number
  fb_user_id?: string
  name?: string | null
  first_name?: string | null
  platform?: string
  tags?: ConversationTag[]
  reply_count?: number
  first_seen_at?: string | null
  last_interaction_at?: string | null
  /** not in the current serializer; the UI badge guards on "active" */
  status?: string
}

/** Row of /api/crm/customers → data.items (crm_routes serializer). */
export interface CrmCustomer {
  id: number
  name?: string | null
  phone?: string | null
  source?: string
  stage?: string
  total_interactions?: number
  interested_in?: string | null
  last_intent?: string | null
  notes?: string | null
  first_seen_at?: string | null
  last_contacted_at?: string | null
}

// ── Ads ─────────────────────────────────────────────────────────────────────

/** Row of /api/ads/accounts (FB Marketing API passthrough). */
export interface AdAccount {
  /** Facebook ad-account id ("act_…") */
  id: string
  name?: string
  /** FB numeric status code (1=ACTIVE, 2=DISABLED, …) — INT, not a string */
  account_status?: number
  currency?: string
  /** FB sends numeric strings */
  amount_spent?: string
  balance?: string
}

// ── Analytics ───────────────────────────────────────────────────────────────

/** Row of /api/analytics/top-commenters. */
export interface TopCommenter {
  name?: string
  count: number
  last_comment?: string
  /** not sent by the engine today; kept for the stable ranked-list key */
  commenter_id?: number | string
}

/** Row of /api/analytics/overview → data.top_rules. (v10-W4: export dropped — nested in AnalyticsOverview only) */
interface TopRule {
  rule_id?: number | null
  name?: string
  count: number
}

/** GET /api/analytics/overview payload (analytics.py). */
export interface AnalyticsOverview {
  total_replies?: number
  today_replies?: number
  fan_count?: number | null
  /** "YYYY-MM-DD" → reply count */
  daily_breakdown?: Record<string, number>
  /** "YYYY-MM-DD" → hour → count */
  hourly_heatmap?: Record<string, Record<string, number>>
  top_rules?: TopRule[]
  sentiment_distribution?: Record<string, number>
  peak_hour?: number | null
  date_range_days?: number
}

/** GET /api/analytics/dashboard payload (analytics_engine.get_dashboard_overview). */
export interface AnalyticsDashboard {
  total_replies?: number
  today_replies?: number
  active_rules?: number
  total_subscribers?: number
  unique_commenters?: number
  prior_replies?: number
  change_pct?: number
  period_days?: number
  total_messages?: number
  total_conversations?: number
  total_customers?: number
}

// ── Dashboard bundle (/api/dashboard/bundle) ────────────────────────────────

/** Reply-count trend percentages (vs yesterday / prior week). (v10-W4: export dropped — nested in DashboardStats only) */
interface TrendData {
  today?: number
  week?: number
}

export interface DashboardStats {
  total_replies: number
  today_replies: number
  fan_count: number
  top_rule_id: number | null
  /** "YYYY-MM-DD" → reply count (last 7 days) */
  chart: Record<string, number>
  trend: TrendData
}

export interface DashboardConnection {
  connected: boolean
  page_name?: string
  error?: string
}

export interface DashboardMessages {
  total_conversations: number
  total_messages: number
  unread_conversations: number
  bot_replies: number
}

/** Rule summary inside the bundle (id/name/enabled only). */
export interface BundleRule {
  id: number
  name: string
  enabled: boolean
}

/** Row of bundle.recent_replies (+ legacy aliases the UI falls back to). */
export interface RecentReply {
  id: number
  commenter_name?: string | null
  comment_text?: string | null
  reply_text?: string | null
  fb_comment_id?: string | null
  rule_id?: number | null
  created_at?: string | null
  /** legacy alias read as `commenter_name || commenter` */
  commenter?: string | null
  /** legacy alias read as `comment_text || text` */
  text?: string | null
  /** legacy alias read as `reply_text || reply` */
  reply?: string | null
}

export interface DashboardBundle {
  stats?: DashboardStats
  connection?: DashboardConnection
  messages?: DashboardMessages
  rules?: BundleRule[]
  rules_count?: number
  active_rules_count?: number
  bot_status?: { running?: boolean; interval?: number }
  ai_status?: { available?: boolean; provider?: string }
  recent_activity?: Array<{
    type?: string
    level?: string
    text?: string
    detail?: string
    time?: string
  }>
  recent_replies?: RecentReply[]
}

// ── Payments ────────────────────────────────────────────────────────────────

/** GET /api/payments/balance payload. */
export interface PaymentBalance {
  balance: number
  currency: string
}

/** Row of /api/payments/history (PaymentRequest serializer). */
export interface PaymentRecord {
  payment_id: number
  amount?: number
  provider?: string
  phone?: string | null
  reference?: string | null
  status?: string
  note?: string | null
  created_at?: string | null
}

// ── Activity log ────────────────────────────────────────────────────────────

/** Row of /api/logs (BotLog serializer — no id; UI keys on `log.id || i`). */
export interface LogEntry {
  id?: number | string
  level?: string
  message?: string
  created_at?: string | null
}

// ── Support tickets ─────────────────────────────────────────────────────────

/** Row of /api/support/tickets and the ticket-detail payload. */
export interface SupportTicket {
  id: number
  subject?: string
  body?: string
  priority?: string
  status?: string
  email?: string | null
  created_at?: string | null
  /** only on the ticket-detail payload */
  replies?: SupportTicketReply[]
}

/** Row of the ticket-detail "replies[]" thread. (v10-W4: export dropped — nested in SupportTicket only) */
interface SupportTicketReply {
  id: number
  message?: string
  is_admin?: boolean
  created_at?: string | null
}

// ── Scheduled posts / content calendar ─────────────────────────────────────

/** Row of /api/scheduled-posts and /api/calendar (ScheduledPost serializer). */
export interface ScheduledPost {
  id: number
  message?: string | null
  image_url?: string | null
  scheduled_at?: string | null
  status?: string
  fb_post_id?: string | null
  created_by?: string
  created_at?: string | null
  published_at?: string | null
}

// ── Landing / public site ───────────────────────────────────────────────────

/** Row of /api/public/testimonials (empty until real quotes are seeded). */
export interface Testimonial {
  id?: string | number
  metric?: string
  text?: string
  name?: string
  role?: string
}

// ── Facebook connection (dashboard/pages) ──────────────────────────────────

/** GET /api/facebook/settings payload. */
export interface FacebookSettings {
  page_id?: string
  has_token?: boolean
  connected?: boolean
  page_name?: string
}

/** POST /api/facebook/test payload. */
export interface FacebookTestResult {
  connected: boolean
  fan_count?: number
  error?: string
  warning?: string
  scopes?: { scopes?: string[] }
}

// ── Webhook health (connect page) ──────────────────────────────────────────

/** GET /api/webhook/check payload (webhooks.py). */
export interface WebhookCheck {
  configured?: boolean
  secret_source?: string
  verify_token?: string
  webhook_url?: string
  subscribed_fields?: string[]
  subscribed?: boolean
  subscribe_error?: string
  messages_field_subscribed?: boolean
  feed_field_subscribed?: boolean
  instructions?: string[]
}
