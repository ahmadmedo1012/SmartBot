/**
 * v14-E7 (تصميم D13 §6.2 webhook) — توقيع أحداث فيسبوك (X-Hub-Signature-256)
 * وأدوات التوكن لمهاجم P07.
 *
 * آلية التوقيع (app/webhooks.py L82-87): sha256=HMAC(FACEBOOK_APP_SECRET, body)
 * مع مقارنة زمنية hmac.compare_digest — التوقيع على البايتات الخام نفسها
 * التي تُرسل (نفس نمط tests القائمة).
 */
import { createHmac } from 'node:crypto'

/** السر الذي يضبطه السكربت المحلي (FACEBOOK_APP_SECRET). */
export const APP_SECRET = process.env.SIM_APP_SECRET || 'sim-app-secret'

/** توكن تحقق الاشتراك (FB_WEBHOOK_VERIFY_TOKEN). */
export const VERIFY_TOKEN = process.env.SIM_WEBHOOK_VERIFY_TOKEN || 'sim-verify-token'

export interface SignedWebhook {
  body: string
  headers: { 'x-hub-signature-256': string; 'content-type': string }
}

/** توقيع جسم خام كما يرسله فيسبوك فعلياً. */
export function signRaw(body: string, secret = APP_SECRET): SignedWebhook {
  return {
    body,
    headers: {
      'x-hub-signature-256': 'sha256=' + createHmac('sha256', secret).update(body).digest('hex'),
      'content-type': 'application/json',
    },
  }
}

/** توقيع كائن (JSON.stringify مرة واحدة — التوقيع على نفس البايتات). */
export function signWebhook(bodyObj: object, secret = APP_SECRET): SignedWebhook {
  return signRaw(JSON.stringify(bodyObj), secret)
}

/** توقيع خاطئ عمداً (سر مزيف) — فحص 401. */
export function signWithBadSecret(bodyObj: object): SignedWebhook {
  return signWebhook(bodyObj, 'attacker-unknown-secret')
}

// ── بناة الأحداث (أشكال فيسبوك الحرفية من app/webhooks.py) ─────────────

export interface CommentEventOpts {
  commentId: string
  text: string
  fromId: string
  fromName: string
  postId?: string
}

/** entry[].changes[] — تعليق feed جديد (verb=add, item=comment). */
export function commentEvent(pageId: string, opts: CommentEventOpts): object {
  return {
    object: 'page',
    entry: [
      {
        id: pageId,
        time: Date.now(),
        changes: [
          {
            field: 'feed',
            value: {
              item: 'comment',
              verb: 'add',
              comment_id: opts.commentId,
              message: opts.text,
              from: { id: opts.fromId, name: opts.fromName },
              post_id: opts.postId || 'p_sim_1',
              created_time: Math.floor(Date.now() / 1000),
            },
          },
        ],
      },
    ],
  }
}

export interface MessageEventOpts {
  senderId: string
  senderName?: string
  mid: string
  text: string
}

/** entry[].messaging[] — رسالة ماسنجر واردة. */
export function messageEvent(pageId: string, opts: MessageEventOpts): object {
  return {
    object: 'page',
    entry: [
      {
        id: pageId,
        time: Date.now(),
        messaging: [
          {
            sender: { id: opts.senderId, ...(opts.senderName ? { name: opts.senderName } : {}) },
            recipient: { id: pageId },
            timestamp: Date.now(),
            message: { mid: opts.mid, text: opts.text },
          },
        ],
      },
    ],
  }
}

// ── توكنات مهاجم P07 ──────────────────────────────────────────────────

function b64url(obj: object | string): string {
  const json = typeof obj === 'string' ? obj : JSON.stringify(obj)
  return Buffer.from(json, 'utf-8').toString('base64url')
}

/**
 * توكن منتهي الصلاحية موقّع بالمفتاح المحلي المعروف (P07-6 — المقصود
 * في الطبقة المحلية حصراً؛ في الإنتاج المفتاح مجهول والفحص 401 دوماً).
 */
export function expiredJwt(secret: string, sub = 'p02_expired', tid = 0, jti = 'sim-expired-jti'): string {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const payload = { sub, tid, jti, ver: 0, iat: now - 90_000, nbf: now - 90_000, exp: now - 86_400 }
  const sig = createHmac('sha256', secret || 'sim-unknown-secret')
    .update(`${b64url(header)}.${b64url(payload)}`)
    .digest('base64url')
  return `${b64url(header)}.${b64url(payload)}.${sig}`
}

/** توكن موقّع بمفتاح خاطئ (مزوّر — P07-4). */
export function forgedJwt(sub = 'admin', tid = 0): string {
  return expiredJwt('attacker-wrong-secret', sub, tid, 'sim-forged-jti')
}

/** تعديل حمولة توكن صالح مع إبقاء التوقيع القديم (P07-5). */
export function tamperJwt(validToken: string, newSub = 'admin'): string {
  const parts = validToken.split('.')
  if (parts.length !== 3) throw new Error('توكن غير صالح للتعديل')
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'))
  payload.sub = newSub
  payload.tid = 0
  return `${parts[0]}.${b64url(payload)}.${parts[2]}`
}
