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

export interface CommentItem {
  id: number
  post_id?: string | number | null
  post_permalink?: string | null
  author_name?: string | null
  from_name?: string | null
  commenter?: string | null
  message?: string | null
  text?: string | null
  created_time?: string | null
  created_at?: string | null
  replied?: boolean
  has_reply?: boolean
  hidden?: boolean
  sentiment?: string | null
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

export interface AnalyticsOverview {
  totals?: {
    messages?: number
    replies?: number
    comments?: number
    subscribers?: number
    [k: string]: unknown
  }
  daily?: TrendPoint[]
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
  content?: string | null
  message?: string | null
  scheduled_at?: string | null
  status?: string
  published?: boolean
  [k: string]: unknown
}

export interface Broadcast {
  id: number
  message?: string | null
  content?: string | null
  status?: string
  audience?: string
  recipients?: number
  sent?: number
  failed?: number
  created_at?: string | null
  sent_at?: string | null
  [k: string]: unknown
}

export interface Subscriber {
  id: number
  name?: string | null
  first_name?: string | null
  last_name?: string | null
  psid?: string | null
  phone?: string | null
  email?: string | null
  tags?: string[] | { id: number; name: string }[]
  subscribed?: boolean
  is_subscribed?: boolean
  created_at?: string | null
  [k: string]: unknown
}

export interface Customer {
  id: number
  name?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  notes?: string | null
  total_orders?: number
  total_spent?: number
  created_at?: string | null
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

export interface LogEntry {
  id: number
  event?: string
  action?: string
  level?: string
  message?: string | null
  detail?: string | null
  created_at?: string | null
  ts?: string | null
  [k: string]: unknown
}

export interface Offer {
  id: number
  title?: string | null
  code?: string | null
  discount?: number | string | null
  description?: string | null
  is_active?: boolean
  active?: boolean
  claims?: number
  max_claims?: number | null
  expires_at?: string | null
  [k: string]: unknown
}

export interface ReplyTemplate {
  id: number
  name?: string | null
  title?: string | null
  content?: string | null
  body?: string | null
  category?: string | null
  created_at?: string | null
  [k: string]: unknown
}

export interface WalletBalance {
  balance?: number
  currency?: string
  [k: string]: unknown
}

export interface PaymentRecord {
  id: number
  amount?: number
  method?: string
  status?: string
  kind?: string
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

export interface SupportTicket {
  id: number
  subject?: string | null
  message?: string | null
  status?: string
  created_at?: string | null
  replies?: { id: number; message?: string | null; created_at?: string | null; [k: string]: unknown }[]
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

export interface AdAccount {
  id: string
  name?: string
  currency?: string
  balance?: number
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

export interface MarketingCampaign {
  id: number
  name?: string | null
  title?: string | null
  channel?: string
  status?: string
  sent?: number
  recipients?: number
  created_at?: string | null
  [k: string]: unknown
}

export interface CalendarEntry {
  id: number
  content?: string | null
  message?: string | null
  scheduled_at?: string | null
  date?: string | null
  status?: string
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
