# v24-A3 — Mobile UX Flows Audit (READ-ONLY Diagnostic)

- **Task ID:** v24-A3 · **Agent:** MOBILE-FLOWS (mobile-flows-auditor)
- **Scope:** User flows + interaction design for mobile (`نسخة الهاتف` focus), static code analysis only — no live testing, no source modifications.
- **Surface:** `fb_dashboard/frontend/src` — 24 dashboard pages, shell (DashboardShell / AdminSidebar / MobileBottomNav), messages inbox (615 lines traced end-to-end), forms (autoreply / sequences / broadcast / posts / settings / billing), data pages (analytics / comments / audience), feedback systems (sonner toasts, react-query states), onboarding (wizard + react-joyride tour), gesture inventory.
- **Verdict scale:** P0 (blocks the flow on mobile), P1 (serious UX harm / data-loss risk), P2 (noticeable friction), P3 (polish).

---

## 1. Executive Summary

SmartBot's mobile shell is **structurally sound and genuinely above-average**: a real bottom tab bar with a "المزيد" sheet covering all 23 sections (2-tap reachability), a chat master–detail pattern with per-conversation drafts, optimistic send with rollback, an honest scroll contract, 16px inputs that dodge the iOS zoom, per-query retry affordances in Arabic, and a best-in-class offline→Arabic-ApiError wrap in `csrf-client.ts` that makes flaky-network failures comprehensible. Button-level loading, skeletons, `keepPreviousData` dimming and dedicated EmptyState/ErrorState components are used consistently across all 24 pages.

However, the app is a **desktop app with a responsive skin, not a mobile app**. The gap is in interaction design, not layout:

1. **Zero touch gestures** — no swipe, no pull-to-refresh, no long-press, no drag, no haptics anywhere in the repo (grep for `touchstart|pointerdown|swipe|vibrate|pull` → 0 matches outside LandingIslands decorations).
2. **Zero deep-linking** — no dashboard page uses `useSearchParams`; thread selection, editors, and filters are all component state. Refreshing inside a conversation, or pressing Android back inside a thread, loses your place (browser back exits the page instead of returning to the list).
3. **Unconfirmed destructive actions** — broadcast "إرسال" mass-messages every subscriber on a single 40px tap with no confirmation and no audience count; autoreply and post deletes are single-tap icon buttons; sequences and team *do* have the correct two-step pattern → inconsistency, not absence of a pattern.
4. **The onboarding tour is broken on mobile** — all 5 react-joyride targets (`#sidebar-rules` … `#subscribe-btn`) live in the `hidden md:block` sidebar, i.e. `display:none` below md; the tour auto-starts for fresh mobile tenants and its spotlight/tooltip silently mis-positions or dies.
5. **No list virtualization** — the inbox renders up to 200 message bubbles (`.map` in plain DOM) and re-renders them every 5s poll; 25 conversation rows. No `react-window`/`virtuoso` in the dependency tree.
6. **iOS zoom + sub-44px touch targets persist in the raw-input drift zone** — posts composer textarea is `text-sm` (14px → iOS zooms on focus), the comments quick-reply input is `h-8 text-sm` (32px target + zoom), autoreply row actions are `size-8` (32px).
7. **`text-2xs` (11px) / `text-3xs` (10px) typography everywhere** — 175 occurrences across 24 pages; bottom-nav labels, badges and message timestamps sit below any mobile readability floor (Material 12sp / HIG 11pt), in an outdoor-sunlight market like Libya.

The single highest-leverage fix: **encode the open conversation in the URL (`/dashboard/messages?c=<id>`), sync it with history, and hide the bottom nav inside a thread** — that one change converts the messages flow from "stateful page" to an app-like chat navigation, and unlocks deep links, browser-back-to-list, and share-per-thread.

---

## 2. Navigation Architecture Assessment

### 2.1 Structure (how 24 pages are reached)

| Element | Implementation | Mobile quality |
|---|---|---|
| Bottom tab bar | `MobileBottomNav.tsx:180-214` — 5 fixed items (لوحة التحكم / الرسائل / التحليلات / الإشعارات / المزيد), `fixed inset-x-0 bottom-0 z-30`, `.safe-area-pb`, `backdrop-blur` | ✅ Good: always visible, 44px+ row targets, `aria-current`, active underline dot |
| "More" sheet | `MobileBottomNav.tsx:93-177` — bottom sheet, all 23 items in `grid-cols-4` sections, theme toggle + logout row | ✅ Good: 2-tap max depth, focus trap, Escape, focus restore, `aria-modal` |
| Desktop sidebar | `AdminSidebar.tsx` `hidden md:block` — single nav data source (`defaultNavSections`) shared with the sheet | ✅ No duplication |
| Page header | `PageHeader.tsx` — sticky top, breadcrumbs, actions slot | ✅ Sticky on scroll |

**Verdict: the 2-tier bottom-nav + sheet architecture is the correct pattern and is well executed.** Every section is ≤2 taps, the data source is shared, and the a11y contract on the sheet (focus trap / Tab cycle / Escape / restore to trigger, `MobileBottomNav.tsx:52-83`) is better than most production apps.

### 2.2 Gaps

| # | Issue | Evidence | Severity |
|---|---|---|---|
| N1 | **Sheet is not wired to history.** Opening the "المزيد" sheet does not push a history entry; Android hardware back closes *the page* (navigates away) instead of the sheet. Same for the messages thread view (see M2). | `MobileBottomNav.tsx:85-89` (`go()` only calls `router.push`), no `popstate`/`pushState` handling | **P1** |
| N2 | **No swipe gestures at all.** The sheet cannot be swipe-dismissed; no edge-swipe; no swipe between tab sections. The sheet's own CSS transition (`globals.css:524`) begs for a touch handler. | grep `onTouchStart|pointerdown|swipe` → 0 matches | **P2** |
| N3 | **No live badges on the bottom bar.** `NavItem` supports `badge` (`AdminSidebar.tsx:25`) but no consumer computes unread counts; the notifications page knows its unread total (`notifications/page.tsx:141`) yet the mobile Messages/الإشعارات tabs never show it. On mobile, the tab bar is the notification surface. | `MobileBottomNav.tsx:24-29` (static BAR_ITEMS) | **P2** |
| N4 | **Bottom-nav labels are `text-2xs` (11px).** Below readability floor for primary navigation. | `MobileBottomNav.tsx:149,193` + `globals.css:90` (`--text-2xs: 0.6875rem`) | **P2** |
| N5 | **No deep-linking to any sub-state.** No dashboard page imports `useSearchParams` (grep → 0 files). Filter, search, thread and editor states are all `useState` — refresh/state loss, no shareable URLs, notifications can't route to a specific conversation. | `messages/page.tsx:118-127`, `sequences/page.tsx:560-561` | **P2** (P1 within messages flow) |
| N6 | Tour targets invisible on mobile (see §6). | `OnboardingTour.tsx:16-48` | **P1** |
| N7 | Tab switching keeps per-page scroll? Each route remounts via `key={pathname}` (`DashboardShell.tsx:95`) — scroll position is not restored on tab return (no `scrollRestoration` config). Minor. | `DashboardShell.tsx:95` | P3 |

### 2.3 Navigation verdict

> **Architecture: right pattern, well-built shell, top ~10% of Tailwind dashboards for mobile nav. Interaction wiring: incomplete — history/back integration, badges, and gesture dismissal are missing, which is what separates "works on mobile" from "feels native on mobile."**

---

## 3. Per-Flow Findings

### 3.1 FLOW: Messages — conversation list → open thread → reply (traced fully)

`messages/page.tsx` (615 lines). What's already right (keep): master–detail with mobile back row (L327-334, L462-466); per-conversation drafts (L128-137 — draft never bleeds across customers); optimistic send + snapshot rollback (L274-307); optimistic mark-read across all cached lists (L205-220); scroll contract — land at bottom on fresh thread/sent reply, follow only when within 150px of bottom (L233-254); `prefers-reduced-motion` clamp on `scrollIntoView` (L41-51, L236); 16px composer (no iOS zoom) with `field-sizing` auto-grow (L596-604 + `textarea.tsx:21`); 44px send button (Button default h-12); debounced search 300ms (L120-126); `keepPreviousData` + opacity dim (L143-160, L176-194); error ≠ empty state (L396-426, L485-497); `dir="auto` bidi isolation on names/bodies; Arabic offline error text via `csrf-client.ts:140-142`.

| # | Issue | file:line | Severity | Recommended pattern (exact code) |
|---|---|---|---|---|
| M1 | **No virtualization** — thread renders up to 200 bubbles via `messages.map`, re-rendered every 5s poll (`refetchInterval: 5000`); conversation list renders 25 rows. On a mid-range Android with a 200-message thread, every poll re-diffs 200 keyed nodes; scroll stutter during polls is likely. Backend caps: `inbox.py:317,376-378` (200 conv, 25/page; thread limit 200). | `messages/page.tsx:437-441` (list), `506-575` (thread map), `150,182` (polls) | **P1** | Adopt `react-virtuoso` (RTL + variable heights + stickies, works with plain flex columns): wrap the thread: `<Virtuoso data={messages} followOutput="smooth" initialTopMostItemIndex={messages.length-1} itemContent={(_, msg) => <Bubble msg={msg}/>} />` — this also *replaces* the hand-rolled scroll contract (`followOutput` only follows when at bottom, built-in). Keep the 5s poll; the diff cost drops to visible window only. |
| M2 | **Thread selection is component state** — no URL param. Consequences: (a) refresh inside a thread → back to list; (b) browser/Android back → *leaves the whole page* instead of returning to the list; (c) notification deep-link to a conversation impossible; (d) share/link impossible. | `messages/page.tsx:127` `useState<string|null>(null)`; back row `462-466` only `setSelectedId(null)` | **P1** | Route-param sync: `const sp = useSearchParams(); const router = useRouter(); const selectedId = sp.get("c"); const open = (id:string)=>router.push(`/dashboard/messages?c=${id}`); const close = ()=>router.back();` — browser back then lands on the list naturally; add `history: push` semantics so Android back = close thread. (Next 16: `useSearchParams` in a client page is stable.) |
| M3 | **Bottom tab bar stays visible inside a thread** — the shell always reserves `4rem + safe-area` and renders the nav (`DashboardShell.tsx:75,101`). In a chat surface this steals ~64px of message area and doubles the "chrome" (nav + composer). Messenger/WhatsApp go immersive in threads. | `DashboardShell.tsx:75` `pb-[calc(4rem+env(safe-area-inset-bottom))]`, `:101` | **P2** | Hide the bar on the messages thread route: in `MobileBottomNav`, `const hide = pathname.startsWith("/dashboard/messages") && sp.get("c"); if (hide) return null;` and make the shell padding conditional (`pb-0` when hidden) — safe-area still respected by the composer's own `env()` padding. |
| M4 | **No scroll-to-bottom affordance** — the scroll contract correctly *stops* yanking the view, but gives no way back: after reading history, the user must manually scroll through hundreds of bubbles; new arrivals are silent. | `messages/page.tsx:233-254` (no button), `:577` (`messagesEndRef` used only programmatically) | **P2** | Floating chevron, bottom-end above composer, shown when `scrollTop` is >1 screen from bottom; with Virtuoso use `rangeChanged`/`atBottomState` props: `{showToEndButton && <button className="fixed bottom-24 end-4 size-11 rounded-full bg-card shadow-lg …" onClick={()=>virtuosoRef.current?.scrollToIndex({index:"LAST"})}><ChevronDown className="rtl:-rotate-0"/></button>}` + a small unread counter badge ("رسائل جديدة ↓"). |
| M5 | **Thread header shows no identity** — the mobile back row is a bare "كل المحادثات" button; the customer name/subject is only visible in the list. In-thread you reply to nobody-in-particular. | `messages/page.tsx:462-466` | **P2** | Promote identity into the back bar: `<div className="md:hidden flex items-center gap-2 p-2 border-b …"><Button onClick={close}><DirectionalIcon …/></Button><div className="min-w-0"><p className="text-sm font-bold truncate" dir="auto">{conv.subject||senderName}</p><p className="text-2xs text-muted-foreground">{countPhrase(conv.message_count,"رسالة","رسالتين","رسائل")}</p></div></div>` |
| M6 | **Drafts lost on refresh** — reply drafts live in React state; a refresh or crash mid-compose discards them (contrast: the sequence builder holds *unsaved steps* in state too, see S1). | `messages/page.tsx:133-137` | P2 | Persist to sessionStorage per conversation: on change, `sessionStorage.setItem(\`draft:${selectedId}\`, text)`; hydrate `drafts` lazily on thread open; clear on successful send. |
| M7 | **Keyboard occlusion handling absent** — viewport has no `interactiveWidget` hint; on Android Chrome (default `resizes-visual`) the fixed bottom nav remains glued behind the keyboard and the composer can sit under it; iOS auto-scrolls but the fixed bar flickers. | `app/layout.tsx:46-62` (viewport object, no `interactiveWidget`) | **P2** | Add `interactiveWidget: "resizes-content"` to the `Viewport` export (Next supports `interactiveWidget` in the viewport object) — the layout viewport then shrinks with the keyboard, fixed bar parks above it, and `pb` calculations stay truthful. Pair with `visualViewport` listener if Android edge cases remain. |
| M8 | **No pagination / load-earlier** — conversations show page 1 (25) only; thread shows the latest 200 messages with no "load earlier messages" affordance. | `messages/page.tsx:145` (no page param), backend `inbox.py:213` (`per_page=25`), `:418` (`.limit(200)`) | P2 | Infinite list: `useInfiniteQuery` with `getNextPageParam` + a "تحميل الرسائل الأقدم" row pinned at the top of the scroller (Virtuoso `startReached`); pass `page` for conversations. |
| M9 | Composer has **no quick-replies / emoji / attachments** — operators who just built autoreply templates in another tab must retype them per customer. | `messages/page.tsx:580-607` | P2 (feature) | A "⚡" chip row above the textarea listing top-3 rules (`/api/rules` already cached in react-query): one tap fills the draft. Emoji: a lightweight picker or rely on native keyboard; attachments need backend contract first. |
| M10 | Send button position: first in DOM → physical **right** in RTL, inline with textarea; 44px ✓, bottom-anchored ✓ (thumb zone OK). Enter sends, Shift+Enter newline (`:599`) — desktop-correct; on mobile keyboards Enter = "send" is acceptable, but no setting. | `messages/page.tsx:582-589,599` | P3 | Keep; consider a settings toggle "زر الإرسال بالإدخال". |
| M11 | No delivery/read state on page-side bubbles beyond the transient `opacity-70` pending cue; after invalidation the server copy arrives with no ✓/✓✓ distinction. | `messages/page.tsx:519-525` | P3 | Post-invalidated page bubbles could render a subtle `Check` glyph in the timestamp row. |

### 3.2 FLOW: Comments moderation → quick reply / AI suggest

`comments/page.tsx`. Right: cards not table ✓, per-row drafts that survive other rows' sends (L111-121), AI suggest gated on `/api/ai/status` with honest disabled state (L48-87), insert-into-draft + focus restore (L93-104).

| # | Issue | file:line | Severity | Fix |
|---|---|---|---|---|
| C1 | **Quick-reply input violates both mobile input rules** — raw `<input>` `h-8` (32px touch height) and `text-sm` (14px → **iOS auto-zooms the viewport on every focus**). This is the highest-frequency text field in the whole app for a page owner. | `comments/page.tsx:198-210` | **P1** | Replace with the shared `Input` (h-12, `text-base md:text-sm`) or minimally: `className="… h-11 text-base md:text-sm …"`. |
| C2 | No optimistic reply — the reply POST round-trip leaves the button disabled with no in-thread feedback; on a slow Libyan link it feels dead. | `comments/page.tsx:106-124` | P2 | Optimistically stamp the row: `queryClient.setQueryData(["comments"], old => old?.map(c => c.id===id ? {...c, reply_text: message} : c))` in `onMutate`, rollback in `onError` (the exact `messages/page.tsx:274-307` recipe, already proven in-repo). |
| C3 | Fixed `limit=30`, no "load more", no filter by post — a busy page silently truncates moderation backlog. | `comments/page.tsx:31` | P2 | "تحميل المزيد" button appending `&before=`/page param, plus a post filter chip row (`overflow-x-auto`, pattern exists in messages L362-377). |
| C4 | No swipe actions (hide/delete/resolve) — every action is a small inline button; world-class moderation UIs put archive/hide on a left-swipe. | — | P3 | Long-term: a swipeable row (dnd-kit `PointerSensor` is already a compatible dep-free choice, or a minimal `touchstart/touchmove` reveal). Not blocking. |
| C5 | The AI suggest **dialog is centered** on mobile (`dialog.tsx:58` `top-1/2 -translate-y-1/2`) — fine, but bottom-anchored would be more thumb-native; it does scroll internally (`max-h-[90dvh] overflow-y-auto` ✓). | `components/ui/dialog.tsx:58` | P3 | Optional: `sm:` variant keeps center; mobile uses `items-end` bottom-sheet geometry. |

### 3.3 FLOW: Autoreply rule editor (create / edit / toggle / delete)

`autoreply/page.tsx`. Right: `inputMode="numeric"` on priority (L391), 16px raw inputs (L359,370,382,393), Escape-closes form (L341), edit mode prefills (L463-474), per-row button-level `loading` + `disabled` (L400-401,479,482), optimistic behavior toggles with rollback (L160-177).

| # | Issue | file:line | Severity | Fix |
|---|---|---|---|---|
| A1 | **Delete rule is a single 32px icon tap with NO confirmation** — the trash sits between edit and toggle (`size-8 p-0`, L482-484); one fat-finger tap destroys a live rule (its reply history count is shown right above). Sequences (`sequences/page.tsx:728-749`) and team (`team/page.tsx:247`) already implement the two-step inline confirm — the pattern exists in-repo and just isn't applied here. | `autoreply/page.tsx:482-484` | **P1** | Port the two-step: `{confirmId===r.id ? <><Button variant="destructive" onClick={()=>deleteMut.mutate(r.id)}>تأكيد الحذف</Button><Button variant="ghost" onClick={()=>setConfirmId(null)}>إلغاء</Button></> : <Button … onClick={()=>setConfirmId(r.id)}><Trash2/></Button>}` |
| A2 | Row action cluster is 3× `size-8` (32px) icon buttons separated by `gap-1` — under the 44px minimum and adjacent to a destructive control. | `autoreply/page.tsx:460-485` | **P2** | `className="size-11 p-0"` (or `min-h-11 min-w-11`) + `gap-2`; the shared Button already enforces `min-h-11 min-w-11` (button.tsx:11) but the `size-8` override defeats it. |
| A3 | No inline field validation — the save button is disabled until keyword+reply exist, but the user gets no *why* on mobile (the only hint is the disabled state; errors arrive as toasts after a failed POST). | `autoreply/page.tsx:398-405` | P2 | Use the shared `Input`'s `error` prop under each field when `touched && !value`: `<Input error={!keyword.trim() && submitted ? "الكلمات المفتاحية مطلوبة" : undefined} …>` — the shared Input renders `aria-invalid` + error text (input.tsx:54,60-61,83). |
| A4 | Form save buttons are end-of-card, **not sticky** — with the keyboard open on a small screen the "حفظ القاعدة" button can sit behind the keyboard; the pattern repeats on every form page (grep `sticky` in `app/dashboard/**` → 0 matches). | `autoreply/page.tsx:396-406` | P2 | Sticky footer inside the form card: `<div className="sticky bottom-0 -mx-4 -mb-4 px-4 py-3 bg-card/95 backdrop-blur border-t border-border flex gap-2 [&>*]:flex-1">` (sits above the bottom nav thanks to the shell's `pb`). |
| A5 | `autoFocus` on the first field (L355, also broadcast L137) auto-opens the keyboard on mobile the moment the form appears — jarring when the user opened the form just to look. | `autoreply/page.tsx:355` | P3 | Drop `autoFocus` below md (`focusOnMount && window.matchMedia("(min-width: 768px)")` or a `useIsDesktop` hook). |
| A6 | Behavior card is genuinely good (optimistic switches, status strip `role=status`, debounced tone save w/ draft preservation) — no action. | L260-327 | — | Keep as the house pattern. |

### 3.4 FLOW: Sequence builder (create → steps → audience → save)

`sequences/page.tsx`. Right: two-step delete confirm ✓ (L728-749), move-up/down buttons (more mobile-robust than drag, L383-400), numbered step badges, delay inputs `type="number"` (numeric keyboard) on the h-12 shared Input ✓, validity hint (L523-526), audience inline search + per-row enroll with `loading` ✓.

| # | Issue | file:line | Severity | Fix |
|---|---|---|---|---|
| S1 | **Unsaved steps die on refresh** — steps live in local state (`steps` useState, editor ~L340-460); a network blip + reload mid-build loses the whole campaign draft. (Wizard solved this with `sb-onboarding-step`; messages drafts have the same exposure, M6.) | `sequences/page.tsx` editor state (L560-561 for open mode; steps state above) | **P1** (data-loss) | sessionStorage draft keyed by seq id: persist `{name, description, steps}` on change; hydrate on editor open; clear on successful save. Same recipe as the wizard's `STEP_KEY`. |
| S2 | Editor open/close is component state — no URL (`/dashboard/sequences?edit=<id>`), so refresh closes the editor (compounding S1) and "تحرير" isn't linkable from notifications. | `sequences/page.tsx:560-561` | P2 | Route param for editor mode (see M2 recipe). |
| S3 | The sequences list query does **N+1 detail fetches** (`Promise.all` over `/api/sequences/{id}` per row, L568-583) — on a flaky mobile network the list waits for the slowest of N requests; retry:1 only. | `sequences/page.tsx:566-585` | P2 | Backend: include `step_count` in the list response (single query with `func.count()`); frontend drops the fan-out. |
| S4 | Editor's save/cancel buttons are end-of-card, not sticky (same as A4); with 5+ steps open, "حفظ" requires a long scroll. | `sequences/page.tsx:519-530` | P2 | Sticky save bar (A4 recipe). |
| S5 | Step reordering by buttons only — acceptable, but no drag (desktop) either; a long campaign means many taps. | `sequences/page.tsx:383-400` | P3 | Later: dnd-kit sortable with touch `PointerSensor` + `distance: 8` activation (keeps buttons as fallback — a11y preserved). |

### 3.5 FLOW: Broadcast composer (create → send to all)

`broadcast/page.tsx`. Right: create gated on message length ≥5 (L153), send button only on drafts (L188), cancellable states honored (L27-28,200).

| # | Issue | file:line | Severity | Fix |
|---|---|---|---|---|
| B1 | **"إرسال" mass-messages every subscriber on a single tap — no confirmation, no audience size.** This is the single most destructive unguarded action in the app: a thumb brush while scrolling sends an irreversible blast. | `broadcast/page.tsx:188-197` (`onClick={() => sendMut.mutate(b.id)}`), send `:67-81` | **P1** | Two-step confirm (in-repo pattern) **with subscriber count**: `{confirmSend===b.id ? <div className="w-full space-y-2"><p className="text-xs">سيُرسل إلى {countPhrase(totalSubscribers,"مشترك","مشتركين","مشتركين")} — لا يمكن التراجع.</p><div className="flex gap-2"><Button variant="destructive" onClick={…}>تأكيد الإرسال</Button><Button variant="ghost" onClick={()=>setConfirmSend(null)}>إلغاء</Button></div></div> : <Button …>إرسال</Button>}` (subscriber total already available via the cached `["subscribers","audience"]`/analytics queries or a `/api/broadcasts/{id}/preview`). |
| B2 | Composer has **no character counter, no preview, no audience estimate** before creation. | `broadcast/page.tsx:130-158` | P2 | Counter `<span className={cn("text-2xs", message.length>600 && "text-warning")}>{message.length}</span>` + "سيصل إلى ~N مشترك" line (drives B1's confirm copy). |
| B3 | Same non-sticky save + `autoFocus` issues as A4/A5. | `broadcast/page.tsx:137,151-157` | P2/P3 | See A4/A5. |

### 3.6 FLOW: Post composer / publish / delete

`posts/page.tsx`. Right: sync-failure honesty banner (L154-168 — exactly the "stale data" pattern §8 asks for), per-section error/empty/loading, publish/delete disabled per-row during flight.

| # | Issue | file:line | Severity | Fix |
|---|---|---|---|---|
| P1 | **Composer textarea is `text-sm` (14px) raw** — iOS zooms the whole viewport on focus. (The messages composer was explicitly fixed for this in v17-E-F1; this one wasn't.) | `posts/page.tsx:106-115` | **P1** | Swap to shared `<Textarea>` (`text-base md:text-sm`, `field-sizing-content`, dir=auto — textarea.tsx:21) — it exists and is already imported elsewhere on the page family. |
| P2 | **Publish-now and delete are single-tap 40px icon buttons with no confirmation** — publish pushes to the live Facebook page; delete is irreversible. | `posts/page.tsx:248-255` | **P1** | Two-step confirm for both (A1 recipe); or move destructive actions behind a "…" overflow that reveals Confirm UI. |
| P3 | Composer supports text only — no image (image-compress lib exists! `lib/image-compress.ts`), no schedule picker despite a scheduled-posts backend and a calendar page. | `posts/page.tsx:104-129` | P2 (feature) | Add attach button + `<input type="file" accept="image/*">` → `compressImage()` → preview chip; schedule: native `<input type="datetime-local">` for zero-dep mobile UX. |
| P4 | No post-filter/search; list is full dump. | — | P3 | Chip row pattern. |

### 3.7 FLOW: Settings / billing forms

- Settings (`settings/page.tsx`): short forms, `autoComplete="current-password"/"new-password"` ✓ (L154,164), h-12 shared Inputs ✓, inline save — **no issues worth P2**; the only gap is that the page is thin (no notification prefs, no language/theme — theme lives in nav sheet).
- Billing/upgrade (`billing/page.tsx`): `inputMode="tel"` phone (L364) and `inputMode="decimal"` amount (L381) ✓, `dir="ltr"` on numeric fields ✓, plan/payment **radios are full-width tappable rows** (L311-331,336-354) ✓, submit is `w-full` at dialog bottom ✓ (thumb zone), dialog scrolls internally ✓. The bank-amount input is `h-10 text-sm` (L383) — 14px zoom risk, minor because `inputMode=decimal` keyboards still zoom iOS on focus; make it `h-11 text-base md:text-sm` (P3).
- PaymentDialog family (`components/shared/payment/*`): phone `inputMode="numeric"` + paste-friendly copy fields with tests — solid.

**Verdict: settings/billing are the strongest mobile forms in the app** — they use the shared Input contract, numeric inputModes, and full-width bottom CTAs. The drift is entirely in the *raw-input* pages (posts/comments/autoreply/billing-bank-amount).

### 3.8 FLOW: Analytics / audience (data-heavy)

- Analytics (`analytics/page.tsx` + `ChartCard.tsx`): every chart is an independent query with its own loading/error/empty/retry card — **this is the best-architected data page in the app**. Touch: recharts `Tooltip` responds to touch-drag (works); `TrendLineChart` has no pinch/pan and 10px axis ticks (`tick={{ fontSize: 10 }}` — small); the top-rules bars are `hidden sm:block` with the numbers still visible on mobile ✓ (progressive disclosure done right); heatmap cells use `title=` tooltips (hover-only — dead on touch, P3; add a tap→selected-cell state line).
- Audience (`audience/page.tsx`): cards/rows, not tables ✓ (the "table→cards on mobile" question is already answered correctly repo-wide — **no dashboard page renders a real `<table>`**); inline retry links ✓; KPI skeletons pinned to text height (no layout shift) ✓. Gap: `per_page=10` with **no pagination UI** (L29) — subscribers beyond 10 are invisible (P2: "تحميل المزيد" or a count-linked link to a full list).
- Charts poll every 60s — on mobile data plans that's 5 requests/min while idle on the page; consider `refetchInterval` gated on `document.visibilityState === "visible"` (react-query does pause on blur? No — it pauses on window blur only if configured; default continues. Actually refetchInterval continues; a visibility gate is a one-line win) (P3).

### 3.9 FLOW: Onboarding wizard + product tour

- **Wizard** (`OnboardingWizard.tsx`, 929 lines): mobile bottom-sheet geometry (`max-h-[calc(100dvh-2rem)]`, `rounded-t-2xl`, slide-up entrance, L570-584), the *only* scrollable region is step content (overscroll-contain), step dots, persisted step index (`sb-onboarding-step`), skip affordance, Escape→back-mapping, focus management on every transition, save-error alerts with retry/continue-anyway. **This is a reference-quality mobile wizard — nothing to fix.**
- **Tour** (`OnboardingTour.tsx` + `AuthGuard.tsx:139-145`): auto-starts after wizard completion for *every* fresh tenant, including mobile. All 5 targets are sidebar ids (`#sidebar-rules` `#sidebar-analytics` `#sidebar-pages` `#sidebar-subscribers` `#subscribe-btn`, L16-48) which render only inside the `hidden md:block` sidebar (`DashboardShell.tsx:57`) → on mobile the targets are `display:none`: react-joyride cannot spot them; steps render detached/floating or the tour stalls with an overlay the user can't dismiss via overlay (`disableOverlayClose`) — **the first-run experience on a phone is a broken overlay.** (Skip exists via `showSkip` ✓ — the only escape hatch.)
  - **Fix (P1):** branch the step set by viewport — mobile targets are the bottom-nav items (add stable ids to `MobileBottomNav` buttons: `id={`nav-${href.slice(11)}`}`) and placements `"top"`; or simplest: `const isMobile = useMediaQuery("(max-width: 767px)"); if (isMobile) return null;` and show a bottom-sheet "welcome checklist" instead (3 bullets + "ابدأ"), which sidesteps joyride's weak mobile/RTL geometry entirely (placement strings are physical "right", L22-41 — wrong side in RTL).

---

## 4. Feedback Systems Audit

| System | State | Notes |
|---|---|---|
| Toasts (sonner) | `app-toaster.tsx:17-37` — `position="top-center"`, `dir="rtl"`, themed, 5s; `premium-toast.tsx` cards with `role=alert` (errors) / `role=status` | ✅ placement avoids the composer & bottom nav; ✅ RTL; ⚠️ **101 `brandedToast` call sites** — every mutation success announces itself; world-class apps keep success feedback inline (button state → saved ✓) and reserve toasts for background/async outcomes. ⚠️ No **undo** affordance on destructive toasts (delete rule/post/sequence). |
| Loading granularity | Button-level `loading` prop (button.tsx:40-49) used on most mutations; skeleton lists everywhere; `keepPreviousData` + opacity dim (messages list/thread) | ✅ Excellent. |
| Optimistic updates | Only messages (send, mark-read) + autoreply behavior toggles. Comments reply, autoreply rule toggle, sequence enroll = request→invalidate | 🟡 Apply the proven onMutate/rollback recipe to comments reply (C2). |
| Empty states | `EmptyState` component w/ icon+title+description+actions; context-aware copy (search vs fresh, messages L427-435) | ✅ High quality, consistent. |
| Error states | `ErrorState` + per-section retry buttons; Arabic messages end-to-end; error≠empty enforced (messages, posts, sequences) | ✅ High quality. |
| Offline/low-connectivity | `csrf-client.ts:140-142` converts network rejection to Arabic `ApiError(0)` → every toast/retry renders Arabic; posts page shows a stale-data banner for FB sync (L154-168) | ✅ Strong base. ❌ **No global connectivity indicator** (`navigator.onLine`/`online` event unused — grep 0), no "وضع عدم الاتصال" banner, no service worker/PWA offline shell (manifest `display: "standalone"` exists but no SW). On a flaky Libyan link, the only signal is per-query error cards *after* failure. |

**Recommended feedback upgrades (P2):** a slim `useOnlineStatus()` hook rendering a top strip («انقطع الاتصال — البيانات المعروضة قد تكون قديمة») above `SetupWarnings`; and toast discipline: success toasts only for operations whose result isn't visible inline.

---

## 5. Gesture & Interaction Inventory (grep-verified)

| Gesture | Present? | Evidence |
|---|---|---|
| Pull-to-refresh | ❌ none | grep `pull|touchstart|pointerdown` → 0 in src |
| Swipe-dismiss (sheet/dialog) | ❌ | `sheet-panel` is CSS-transition only; backdrop `onClick` + X |
| Swipe actions (list rows) | ❌ | comments/autoreply rows are buttons only |
| Long-press actions | ❌ | none |
| Drag reorder | ❌ (sequences uses ↑/↓ buttons — acceptable) | sequences L383-400 |
| Haptics (`navigator.vibrate`) | ❌ | grep → 0 |
| Keyboard-avoidance | 🟡 no `interactiveWidget`; standard document flow only | layout.tsx:46-62 |
| Focus-visible rings, active:scale | ✅ everywhere | button.tsx, MobileBottomNav |
| Touch-target ≥44px | 🟡 shared Button/Input enforce it; overridden to 32px in autoreply rows, comments reply input (h-8), some `size-10` ghost buttons (sequences move — 40px, borderline OK) | A2/C1 |

---

## 6. Thumb-Zone Analysis (primary actions)

| Action | Placement | Verdict |
|---|---|---|
| Reply send (messages) | Bottom, 48px, physical-right in RTL | ✅ ideal |
| Composer focus | Bottom third | ✅ |
| Quick reply (comments) | Inline mid-card | ✅ position, ❌ 32px target + zoom |
| Form save (all forms) | End-of-card (scroll-dependent), never sticky | 🟡 — make sticky (A4) |
| Broadcast "إرسال" | Mid-list card | 🟡 — must confirm anyway (B1) |
| PageHeader actions (create buttons) | Top bar, physical-left in RTL (`shrink-0` after title in RTL flex) | 🟡 top-corner reach — acceptable for secondary "create" actions; EmptyState CTAs duplicate them in-center ✓ |
| Bottom nav | Bottom, 44px+ rows | ✅ |
| Dialog submit (billing) | Dialog bottom, `w-full` | ✅ |

---

## 7. Consistency Audit

1. **Typography floor** — `text-2xs` (11px) and `text-3xs` (10px) are load-bearing: bottom-nav labels, sheet labels, unread count, message timestamps, badges, meta rows. 175 occurrences of `text-xs/2xs/3xs` across 24 pages. On 5–6" screens at arm's length outdoors, 10–11px Arabic (Cairo's dense glyphs) is not readable. **Recommendation:** introduce a mobile-first minimum — meta text ≥ `text-xs` (12px) on mobile, keep 2xs/3xs for `sm:`+ only (`text-xs sm:text-2xs`), and never below 12px for interactive labels.
2. **Raw-input drift** — 4 pages bypass the shared `Input`/`Textarea` with inconsistent heights (h-8/h-9/h-10/h-11) and `text-sm` (posts P1, comments C1, autoreply — those are `text-base` ✓, billing bank amount). The shared seam already encodes the correct mobile contract (16px, h-12, dir=auto, state icons, error slots). Sweep raw inputs → shared components.
3. **Delete confirmation** — two-step inline confirm exists in sequences + team; absent in autoreply (rules), posts (posts), broadcast (send). One pattern, four adoptions needed.
4. **Icon+label** — icon-only buttons all carry `aria-label` ✓ (114 aria attributes / 38 role attributes across dashboard pages — solid), but several destructive icon buttons (posts delete, autoreply delete) rely on hover color for destructive semantics — on touch there is no hover; destructive styling shows only after tap. Add persistent `text-destructive/70` tint on destructive icon buttons.
5. **Spacing density** — `p-6` page gutters + `max-w-5xl mx-auto` uniform ✓; cards `space-y-2/3` consistent ✓; filter chips exist only on messages+home (other list pages would benefit).
6. **Entrance motion** — `.sb-fade-up` keyed per route (DashboardShell L85-97), reduced-motion guarded ✓ — consistent.

---

## 8. Missing Mobile UX Patterns (what world-class mobile apps do that SmartBot lacks)

1. **URL-as-state / deep links** — every selection (conversation, editor, filter) should be addressable; enables notifications→thread, share, back-button sanity. (M2/S2/N5)
2. **History-aware overlays** — bottom sheet & threads must intercept Android back (popstate/pushState) instead of letting back exit the app. (N1)
3. **Virtualized lists** — chat threads and long feeds need windowing + `followOutput`; 200-node re-renders every 5s is a battery/jank tax. (M1)
4. **Pull-to-refresh** — native reflex for list pages (conversations, comments, notifications) — cheap to add on top of react-query `refetch()`.
5. **Swipe actions** — swipe-to-archive/hide on comments & conversations; swipe-dismiss on the "المزيد" sheet.
6. **Scroll-to-bottom + new-message pill** in the chat thread. (M4)
7. **Sticky save bars** on long forms, with unsaved-changes guard ("لديك تغييرات غير محفوظة" on back navigation). (A4/S4)
8. **Undo toasts** for destructive actions (deleting a rule should be reversible for 5s) instead of/in addition to confirmations.
9. **Global connectivity banner** + stale-data surfacing on the dashboard (the posts page's sync banner is the in-repo template). (§4)
10. **Offline-first PWA** — manifest exists; no service worker, no offline shell, no queued mutations. For the Libyan network reality this is the biggest *strategic* gap; even a cache-last-read-thread SW transforms perceived reliability.
11. **Draft persistence** (sessionStorage) for composers — messages, sequences steps, broadcast. (M6/S1)
12. **Haptic feedback** on send/success (light `navigator.vibrate(10)`) — trivially additive.
13. **Mobile-specific onboarding tour** — viewport-branched steps or a checklist sheet. (§3.9)
14. **Immersive chat** — hide the bottom nav inside a thread. (M3)

---

## 9. Priority Fix List (ordered)

| # | Fix | Files | Severity | Effort |
|---|---|---|---|---|
| 1 | URL-encode the open conversation (`?c=`) + `router.back()` semantics; Android back closes thread, not the page | `messages/page.tsx` | P1 | S |
| 2 | Guard the broadcast send with a two-step confirm + subscriber count | `broadcast/page.tsx` | P1 (destructive) | S |
| 3 | Two-step delete confirm on autoreply rules & posts (publish + delete) — port the sequences pattern | `autoreply/page.tsx`, `posts/page.tsx` | P1 | S |
| 4 | Fix the mobile onboarding tour (viewport-branched targets or checklist sheet) | `OnboardingTour.tsx`, `MobileBottomNav.tsx`, `AuthGuard.tsx` | P1 | S–M |
| 5 | Kill the iOS-zoom inputs: posts textarea → shared `Textarea`; comments quick-reply → h-11+ `text-base` | `posts/page.tsx:106`, `comments/page.tsx:198-210` | P1 | S |
| 6 | Virtualize the message thread (react-virtuoso) with `followOutput` | `messages/page.tsx` | P1 (perf) | M |
| 7 | Persist drafts: messages replies + sequence steps (sessionStorage) | `messages/page.tsx`, `sequences/page.tsx` | P1 (data loss) | S |
| 8 | `interactiveWidget: "resizes-content"` viewport + hide bottom nav in thread + sticky composer above keyboard | `app/layout.tsx`, `DashboardShell.tsx`, `MobileBottomNav.tsx` | P2 | S |
| 9 | Scroll-to-bottom FAB + "رسائل جديدة" pill in thread | `messages/page.tsx` | P2 | S |
| 10 | 44px minimum on row action buttons; destructive tint on icon buttons | `autoreply/page.tsx`, `posts/page.tsx` | P2 | S |
| 11 | Sticky save bars on long forms (autoreply/sequences/broadcast) + unsaved-changes guard | forms pages | P2 | M |
| 12 | Thread identity header on mobile (who am I replying to) | `messages/page.tsx` | P2 | S |
| 13 | Online/offline banner hook + poll-on-visible gating | new `useOnlineStatus`, `QueryProvider` | P2 | S |
| 14 | Live unread badges on bottom-nav Messages/الإشعارات | `MobileBottomNav.tsx` | P2 | S |
| 15 | Optimistic comment reply (onMutate/rollback recipe) | `comments/page.tsx` | P2 | S |
| 16 | Load-more/pagination: conversations (page param), comments (limit), audience (per_page=10) | 3 pages | P2 | M |
| 17 | Mobile tour-safe deep links: `useSearchParams` for sequence editor | `sequences/page.tsx` | P2 | S |
| 18 | Typography floor: no interactive text below 12px on mobile; audit 175 text-xs/2xs/3xs sites | global | P2 | M |
| 19 | History-aware "المزيد" sheet + swipe-dismiss; pull-to-refresh on list pages | `MobileBottomNav.tsx`, lists | P2 | M |
| 20 | Sequence list N+1 → `step_count` in list response | `routers/sequences.py`, page | P2 | S |
| 21 | Undo toasts for deletes; success-toast discipline | global | P3 | M |
| 22 | PWA service worker + offline shell | new | P2 strategic | L |
| 23 | Character counter + preview in broadcast composer; image attach + schedule in post composer | feature | P2 | M |
| 24 | Heatmap tap-to-inspect; axis tick 12px; chart visibility-gated polling | charts | P3 | S |

---

## 10. What must NOT change (protect these)

- The bottom-nav + shared-nav-data architecture (AdminSidebar `defaultNavSections` as single source).
- The messages scroll contract, drafts-per-conversation, optimistic send/rollback, and error≠empty discipline.
- `csrf-client`'s Arabic network-error wrap; per-section retry states in analytics; the posts stale-sync banner.
- The OnboardingWizard's mobile bottom-sheet + step persistence (reference implementation for S1/M6).
- Shared `Input`/`Textarea` mobile contract (16px/h-12/dir-auto) — extend it to stragglers rather than redesigning.

---

*Agent MOBILE-FLOWS · v24-A3 · READ-ONLY — no source files modified during this audit. All file:line references verified against the working tree at commit state of the v24 session (2026-09-11).*
