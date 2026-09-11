/**
 * SmartBot Mobile — أنواع API (منقولة من عقد الباكند الفعلي).
 *
 * المصدر: fb_dashboard/routers/* — كل الردود داخل envelope
 * {success, data, error?} — ان services/api.ts للفك المركزي.
 */

export interface User {
  id: number
  username: string
  name: string
  email?: string | null
  phone?: string | null
  role: 'admin' | 'editor' | 'viewer' | string
  tenant_id: number | null
  is_platform_admin?: boolean
  subscriptionStatus: string
  subscriptionState?: string
  hasActiveSubscription?: boolean
  hasPendingSubscription?: boolean
  subscriptionPlanEnd?: string | null
  plan?: string
  onboardingCompleted: boolean
  permissions?: string[]
  roleLabel?: string
}

export interface AuthTokenResponse {
  token: string
  expiresIn: number
  user: User
}

export interface Plan {
  id: number
  name: string
  name_ar: string
  price: number
  period_days: number
  max_replies: number
  max_pages: number
  max_rules: number
  max_team: number
  has_dm: boolean
  has_ai: boolean
  has_broadcast: boolean
  has_scheduling: boolean
  has_reports: boolean
  has_flows: boolean
  has_offers: boolean
  has_sequences: boolean
  has_analytics_advanced: boolean
  features: string[]
  sort_order: number
  is_active: boolean
}

export interface TrendPoint {
  date: string
  count: number
}

export interface DashboardBundle {
  stats: {
    total_messages?: number
    total_replies?: number
    total_comments?: number
    subscribers?: number
    new_subscribers_24h?: number
    replies_today?: number
    messages_today?: number
    active_rules?: number
    [k: string]: unknown
  }
  trend: TrendPoint[]
  recent_activity?: unknown[]
  [k: string]: unknown
}

export interface ConversationSummary {
  id: number
  subscriber_id?: number | null
  subscriber_name?: string | null
  name?: string | null
  psid?: string | null
  last_message?: string | null
  last_message_at?: string | null
  last_message_direction?: 'in' | 'out' | string
  unread?: number
  unread_count?: number
  updated_at?: string | null
  [k: string]: unknown
}

export interface InboxMessage {
  id: number
  conversation_id: number
  sender?: 'user' | 'bot' | 'admin' | string
  direction?: 'in' | 'out' | string
  content?: string | null
  message?: string | null
  text?: string | null
  created_at?: string | null
  [k: string]: unknown
}

/** مغلّف القوائم المقسّمة — عقد الباكند Paginated<T> (ان lib/envelope.ts). */
export type PaginatedEnvelope<T> = {
  items: T[]
  total?: number
  page?: number
  per_page?: number
}

/** عقد عنصر تعليق — GET /api/comments (routers/replies.py: DB-first). */
export interface CommentItem {
  id: string
  post_id?: string | null
  message?: string | null
  from_name?: string | null
  from_id?: string | null
  created_time?: string | null
  replied_at?: string | null
  reply_text?: string | null
  /** حقول قد تُضاف مستقبلًا — تُعرض فقط عند وجودها */
  sentiment?: string | null
  hidden?: boolean
  [k: string]: unknown
}

export interface Rule {
  id: number
  name: string | null
  keywords: string[] | string
  reply_template: string | null
  dm_template?: string | null
  enabled: boolean
  description?: string | null
  bot_type?: string
  priority?: number
  replies_count?: number
  [k: string]: unknown
}

/** عقد /api/analytics/overview — routers/analytics.py (المفاتيح الفعلية). */
export interface AnalyticsOverview {
  total_replies?: number
  today_replies?: number
  total_comments?: number
  subscribers_count?: number
  daily_breakdown?: Record<string, number>
  hourly_heatmap?: Record<string, Record<string, number>>
  top_rules?: { rule_id?: number; name?: string | null; count?: number }[]
  sentiment_distribution?: { positive?: number; negative?: number; neutral?: number }
  peak_hour?: number | null
  fan_count?: number | null
  date_range_days?: number
  [k: string]: unknown
}

/** عقد /api/analytics/dashboard — analytics_engine.get_dashboard_overview. */
export interface DashboardAnalytics {
  total_replies?: number
  today_replies?: number
  total_messages?: number
  total_subscribers?: number
  total_conversations?: number
  total_customers?: number
  active_rules?: number
  unique_commenters?: number
  change_pct?: number | null
  period_days?: number
  [k: string]: unknown
}

export interface TopCommenter {
  name?: string | null
  subscriber_id?: number | null
  psid?: string | null
  comments?: number
  count?: number
  [k: string]: unknown
}

export interface ScheduledPost {
  id: number
  message?: string | null
  image_url?: string | null
  scheduled_at?: string | null
  status?: string
  fb_post_id?: string | null
  published_at?: string | null
  [k: string]: unknown
}

/** عقد بث — GET/POST /api/broadcasts (routers/broadcasts.py). */
export interface Broadcast {
  id: number
  name?: string | null
  status?: string
  total_recipients?: number
  sent_count?: number
  failed_count?: number
  opened_count?: number
  created_by?: string | null
  created_at?: string | null
  sent_at?: string | null
  [k: string]: unknown
}

/** عقد مشترك — GET /api/subscribers (subscriber_engine.search). */
export interface Subscriber {
  id: number
  fb_user_id?: string | null
  name?: string | null
  first_name?: string | null
  platform?: string | null
  tags?: { id: number; name: string; color?: string | null }[]
  reply_count?: number
  first_seen_at?: string | null
  last_interaction_at?: string | null
  [k: string]: unknown
}

/** عقد عميل CRM — GET /api/crm/customers (routers/crm_routes.py). */
export interface Customer {
  id: number
  name?: string | null
  phone?: string | null
  source?: string | null
  stage?: string | null
  total_interactions?: number
  interested_in?: string | null
  last_intent?: string | null
  notes?: string | null
  first_seen_at?: string | null
  last_contacted_at?: string | null
  [k: string]: unknown
}

export interface TeamMember {
  id: number
  username: string
  email?: string | null
  role: string
  is_active?: boolean
  created_at?: string | null
  [k: string]: unknown
}

/** عقد سجل النشاط — GET /api/logs (routers/bot.py: لا id في الصفوف). */
export interface LogEntry {
  level?: string | null
  message?: string | null
  created_at?: string | null
  [k: string]: unknown
}

/** عقد عرض — GET /api/offers (routers/offers_routes.py). */
export interface Offer {
  id: number
  title?: string | null
  code?: string | null
  description?: string | null
  discount_type?: string | null
  discount_value?: number
  max_uses?: number | null
  used_count?: number
  is_active?: boolean
  expires_at?: string | null
  [k: string]: unknown
}

/** عقد قالب رد — GET /api/templates (routers/templates_routes.py: text). */
export interface ReplyTemplate {
  id: number
  name?: string | null
  text?: string | null
  category?: string | null
  shortcut?: string | null
  [k: string]: unknown
}

export interface WalletBalance {
  balance?: number
  currency?: string
  [k: string]: unknown
}

/** عقد عملية دفع — GET /api/payments/history (payment_requests + subscription_payments مدمجة). */
export interface PaymentRecord {
  /** رقم في payment_requests، أو "s{رقم}" في subscription_payments */
  payment_id: number | string
  kind?: 'topup' | 'subscription' | string
  amount?: number
  provider?: string | null
  phone?: string | null
  status?: string
  note?: string | null
  created_at?: string | null
  [k: string]: unknown
}

export interface NotificationItem {
  id: number
  title?: string | null
  body?: string | null
  message?: string | null
  read?: boolean
  is_read?: boolean
  created_at?: string | null
  [k: string]: unknown
}

/** عقد تذكرة دعم — GET /api/support/tickets (routers/support.py: body). */
export interface SupportTicket {
  id: number
  subject?: string | null
  body?: string | null
  priority?: string | null
  status?: string
  email?: string | null
  created_at?: string | null
  updated_at?: string | null
  replies_count?: number
  [k: string]: unknown
}

export interface FacebookSettings {
  page_id?: string | null
  page_name?: string | null
  access_token_set?: boolean
  has_token?: boolean
  webhook_subscribed?: boolean
  connected?: boolean
  [k: string]: unknown
}

/** عقد حساب إعلاني — GET /api/ads/accounts (DB-first، الرصيد سلسلة). */
export interface AdAccount {
  id: string
  name?: string | null
  account_status?: number
  currency?: string | null
  amount_spent?: string | null
  balance?: string | null
  [k: string]: unknown
}

export interface Sequence {
  id: number
  name?: string | null
  title?: string | null
  status?: string
  is_active?: boolean
  active?: boolean
  steps_count?: number
  subscribers_count?: number
  created_at?: string | null
  [k: string]: unknown
}

/** عقد حملة تسويقية — GET /api/marketing/campaigns (routers/marketing.py). */
export interface MarketingCampaign {
  id: number
  name?: string | null
  message?: string | null
  audience?: string | null
  status?: string | null
  scheduled_at?: string | null
  sent_count?: number
  delivered_count?: number
  opened_count?: number
  clicked_count?: number
  created_at?: string | null
  [k: string]: unknown
}

/** عقد عنصر تقويم — GET /api/calendar (content_calendar._post_to_dict). */
export interface CalendarEntry {
  id: number
  message?: string | null
  image_url?: string | null
  scheduled_at?: string | null
  status?: string | null
  platform?: string | null
  created_by?: string | null
  fb_post_id?: string | null
  [k: string]: unknown
}

export interface PublicConfig {
  balance_transfer_phone_1?: string
  balance_transfer_phone_2?: string
  support_phone?: string
  support_whatsapp?: string
  mobile_wallet_cap?: string
  [k: string]: unknown
}
