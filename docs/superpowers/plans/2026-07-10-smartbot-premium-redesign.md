# SmartBot Premium Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform SmartBot dashboard from average to premium enterprise SaaS quality — calm hierarchy, systematic design language, consistent spacing and typography.

**Architecture:** Single-page React app (Vite + Tailwind v4). All CSS in `index.css` (design tokens + utility classes). 21 UI components in `components/ui/`. 28 pages in `pages/`. Layout shell in `components/topbar.jsx`. No framework changes, no dependency changes.

**Tech Stack:** React 19, Vite 8, Tailwind CSS v4, Framer Motion 12, Radix UI primitives, Recharts, Lucide icons, Sonner toasts, `class-variance-authority`.

## Global Constraints

- Arabic-first RTL — do not break existing `dir="rtl"`, `ps-*`/`pe-*` patterns
- No new dependencies — use what's in `package.json` only
- No backend changes — never touch `fb_dashboard/*.py` or `api/`
- No new features — visual quality only
- All transitions: `cubic-bezier(0.16, 1, 0.3, 1)` default
- All durations: 200ms default, 300ms enter, 150ms exit
- Fonts stay: Cairo (sans), Cairo (heading), JetBrains Mono (mono)
- Reduced motion: must respect `prefers-reduced-motion: reduce` (already in `index.css`)
- Focus ring: 2px `hsl(var(--ring)/0.4)` offset 1px on all interactive elements
- Submit each task with a git commit; prefix commits with `feat(ui):`

---

### Task 1: Refactor Design Tokens & CSS Utilities

**Files:**
- Modify: `src/index.css`

**Interfaces:** Consumes: nothing. Produces: unified token set consumed by all components.

- [ ] **Step 1: Read current index.css**

Already read. Confirm understanding.

- [ ] **Step 2: Revise color tokens in `:root` and `.dark`**

Changes:
- Dark `--background`: deepen from `222 84% 3%` to `225 30% 3%`
- Dark `--card`: deepen from `228 28% 10%` to `228 28% 7%`
- Light `--background`: warm from `210 40% 98%` to `40 20% 97%`
- Light `--primary`: soften from `225 70% 8%` to `225 65% 12%`
- Light `--border`: reduce from `217 19% 85%` to `217 19% 88%`
- Dark `--border`: increase visibility from `217 19% 27%` to `217 19% 22%`
- Dark `--muted-foreground`: increase contrast from `217 19% 58%` to `217 19% 62%`
- Light `--muted-foreground`: increase from `217 19% 45%` to `217 19% 48%`

- [ ] **Step 3: Fix typography scale in base layer**

Replace the current `body` font-size/line-height and h1-h6 rules:

```css
body {
  font-family: var(--font-sans); direction: rtl;
  -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
  font-variant-numeric: tabular-nums;
  font-size: 14px; font-weight: 400; line-height: 1.6;
  scrollbar-gutter: stable; margin: 0; padding: 0;
  transition: background-color 200ms cubic-bezier(0.16, 1, 0.3, 1),
              color 200ms cubic-bezier(0.16, 1, 0.3, 1);
}
```

Replace the h1-h6 block:

```css
h1 { font-size: 1.5rem; font-weight: 700; letter-spacing: -.03em; }     /* 24px */
h2 { font-size: 1.125rem; font-weight: 650; letter-spacing: -.02em; }   /* 18px */
h3 { font-size: .9375rem; font-weight: 600; letter-spacing: -.01em; }   /* 15px */
h4 { font-size: .8125rem; font-weight: 600; }                           /* 13px */
h5 { font-size: .75rem; font-weight: 600; }                             /* 12px */
h6 { font-size: .6875rem; font-weight: 500; text-transform: uppercase; letter-spacing: .04em; } /* 11px */
```

Add micro and mono utility classes:

```css
.text-micro { font-size: .6875rem; font-weight: 500; letter-spacing: 0.02em; }
.text-mono { font-family: var(--font-mono); font-size: .8125rem; letter-spacing: -.01em; }
```

Remove the responsive font-size breakpoints for body (at 640px and 1024px). Keep responsive padding for `.content-container`.

- [ ] **Step 4: Consolidate shadow tokens**

In `@theme`, simplify to 3 shadow levels (replace current 4):

```css
--shadow-sm: 0 1px 2px hsl(225 30% 0% / 0.04), 0 0 0 1px hsl(var(--border) / 0.3);
--shadow-md: 0 4px 16px hsl(225 30% 0% / 0.06), 0 0 0 1px hsl(var(--border) / 0.25);
--shadow-lg: 0 8px 32px hsl(225 30% 0% / 0.08), 0 0 0 1px hsl(var(--border) / 0.15);
```

Keep the `.dark` overrides inline in component styles (not in `@theme`).

- [ ] **Step 5: Remove duplicate/obsolete utility classes**

Remove: `.shadow-glass`, `.shadow-premium`, `.shadow-inner-glow`, `.shadow-card-hover`, `.glass-heavy` (unused), `.glass-card` (use `.glass-premium` instead), `.card`/`.card:hover` CSS classes (now handled by Card component).

- [ ] **Step 6: Update `.content-container` padding**

```css
.content-container { width:100%; margin:0 auto; padding:1rem; animation:fade-in .4s ease-out }
@media (min-width:640px) { .content-container { padding:1.25rem } }
@media (min-width:1024px) { .content-container { padding:1.5rem; max-width:1280px } }
@media (min-width:1440px) { .content-container { max-width:1280px; padding:1.5rem } }
```

- [ ] **Step 7: Verify index.css compiles**

Run: `cd fb_dashboard/frontend && npm run build` — expect no errors, CSS output in `../static/assets/`.

- [ ] **Step 8: Commit**

```bash
git add fb_dashboard/frontend/src/index.css
git commit -m "feat(ui): refactor design tokens, consolidate shadows, fix typography scale

- deepen dark backgrounds, warm light backgrounds
- unify shadow system to 3 levels
- fix heading scale to 24/18/15/13/12/11px
- remove duplicate utility classes
- consistent 14px body, tighter rhythm

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Unify Card Component System

**Files:**
- Modify: `src/components/ui/card.jsx`

**Interfaces:** Consumes: token system from Task 1. Produces: Card, CardInteractive, CardHighlight.

- [ ] **Step 1: Replace card.jsx with unified system**

```jsx
import * as React from "react"
import { cn } from "@/lib/utils"

const Card = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-xl bg-card/55 backdrop-blur-2xl border border-border/10 shadow-sm transition-all duration-200",
      className
    )}
    {...props} />
))
Card.displayName = "Card"

const CardInteractive = React.forwardRef(({ className, ...props }, ref) => (
  <Card
    ref={ref}
    className={cn(
      "cursor-pointer hover:-translate-y-0.5 hover:shadow-lg hover:border-accent/15",
      className
    )}
    {...props} />
))
CardInteractive.displayName = "CardInteractive"

const CardHighlight = React.forwardRef(({ className, color = "accent", ...props }, ref) => (
  <CardInteractive
    ref={ref}
    className={cn(
      "relative overflow-hidden",
      className
    )}
    {...props}
    data-accent={color} />
))
CardHighlight.displayName = "CardHighlight"

const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1 p-5 pb-2", className)}
    {...props} />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-[15px] font-semibold leading-tight tracking-tight", className)}
    {...props} />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-xs text-muted-foreground/80", className)}
    {...props} />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-5 pt-2", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-5 pt-0 gap-2", className)}
    {...props} />
))
CardFooter.displayName = "CardFooter"

export {
  Card, CardInteractive, CardHighlight,
  CardHeader, CardFooter, CardTitle, CardDescription, CardContent,
}
```

Key changes:
- `CardBordered` removed — use `Card` with `className="border-border/40"` when needed
- `CardInteractive` now uses `hover:-translate-y-0.5` (was `hover:scale-[1.01]`)
- CardHighlight replaces the old top-accent pattern (via `data-accent` CSS attr)
- All padding unified to p-5 (20px)

- [ ] **Step 6: Commit**

```bash
git add fb_dashboard/frontend/src/components/ui/card.jsx
git commit -m "feat(ui): unify card system — Card, CardInteractive, CardHighlight

- remove CardBordered, glass-card, card-premium abstractions
- consistent p-5 padding across all card variants
- hover lift via translateY instead of scale

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Sidebar Collapse — CSS Width Transition

**Files:**
- Modify: `src/components/topbar.jsx`

**Interfaces:** Consumes: nothing (pure layout change). Produces: smooth sidebar collapse.

- [ ] **Step 1: Fix sidebar collapse animation**

Replace the `motion.aside` `animate={{ x: sidebarCollapsed ? 176 : 0 }}` approach with CSS width transition.

Current code at topbar.jsx lines 215-289. Replace the sidebar section:

```jsx
{/* ════════════════ DESKTOP SIDEBAR ════════════════ */}
<aside
  className={`hidden md:flex flex-col h-svh glass-sidebar fixed right-0 top-0 z-30 overflow-hidden transition-[width] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
    sidebarCollapsed ? "w-[56px]" : "w-[240px]"
  }`}
  aria-label="القائمة الجانبية الرئيسية"
>
  {/* logo */}
  <div
    className={`flex items-center shrink-0 border-b border-foreground/[0.04] h-12 ${
      sidebarCollapsed ? "justify-center px-0" : "gap-2.5 px-4"
    }`}
  >
    <div className="size-7 shrink-0 rounded-lg bg-gradient-to-br from-accent to-accent/70 flex items-center justify-center shadow-md shadow-accent/20">
      <Bot className="size-3.5 text-foreground" />
    </div>
    {!sidebarCollapsed && (
      <span className="text-sm font-bold text-foreground tracking-wide whitespace-nowrap overflow-hidden">
        SmartBot
      </span>
    )}
  </div>

  {/* nav */}
  <div className="flex-1 overflow-y-auto py-3 space-y-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-track]:bg-transparent">
    {filteredSections.map((section) => (
      <SidebarSectionGroup
        key={section.label}
        label={section.label}
        items={section.items}
        currentPage={currentPage}
        onNavigate={onNavigate}
        collapsed={sidebarCollapsed}
        role={role}
      />
    ))}
  </div>

  {/* user area + collapse */}
  <div className="border-t border-foreground/[0.04] p-2 space-y-1">
    <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${sidebarCollapsed ? "justify-center" : ""}`}>
      <div className="relative shrink-0">
        <Avatar className="size-7">
          <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
            {(username || "?").charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-accent border-2 border-background" />
      </div>
      {!sidebarCollapsed && (
        <div className="flex flex-col items-start min-w-0 opacity-0 animate-[fade-in_0.15s_ease-out_0.1s_forwards] overflow-hidden">
          <span className="text-xs font-medium text-foreground truncate w-full">{username}</span>
          <span className="text-[10px] text-foreground/40">{roleLabel}</span>
        </div>
      )}
    </div>

    <button
      onClick={() => setSidebarCollapsed((p) => !p)}
      className="flex items-center justify-center w-full gap-2 py-2 rounded-lg text-xs text-foreground/35 hover:text-foreground/65 hover:bg-white/[0.04] transition-colors"
      aria-label={sidebarCollapsed ? "توسيع القائمة" : "طي القائمة"}
      title={sidebarCollapsed ? "توسيع القائمة" : "طي القائمة"}
    >
      {sidebarCollapsed ? <PanelLeft className="size-4" /> : <PanelLeftClose className="size-4" />}
      {!sidebarCollapsed && <span>طي القائمة</span>}
    </button>
  </div>
</aside>
```

Also fix the main content margin — replace the `mr-[240px]`/`mr-[64px]` div:

```jsx
<div
  className={`flex flex-1 flex-col min-w-0 transition-[margin-right] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
    sidebarCollapsed ? "md:mr-[56px]" : "md:mr-[240px]"
  }`}
>
```

- [ ] **Step 4: Commit**

```bash
git add fb_dashboard/frontend/src/components/topbar.jsx
git commit -m "feat(ui): sidebar collapse via CSS width transition

- replace translateX animation with CSS width transition for jank-free collapse
- fade in username/logo text via animation delay
- use cubic-bezier(0.16,1,0.3,1) for smooth motion

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Button CVA Cleanup

**Files:**
- Modify: `src/components/ui/button.jsx`

**Interfaces:** Consumes: token system. Produces: cleaned-up button variants.

- [ ] **Step 1: Update button CVA — remove pill sizes, add ghost-accent variant**

Replace `buttonVariants`:

```jsx
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 cursor-pointer [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm",
        outline:
          "border border-input bg-background hover:bg-secondary hover:text-secondary-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-muted hover:text-foreground",
        "ghost-accent":
          "text-muted-foreground hover:text-accent hover:bg-accent/10",
        link:
          "text-primary underline-offset-4 hover:underline",
        premium:
          "bg-gradient-to-r from-primary to-accent text-primary-foreground hover:brightness-110 shadow-md hover:shadow-lg",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-lg px-3 text-xs",
        lg: "h-11 rounded-lg px-8",
        icon: "h-10 w-10",
        "icon-sm": "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)
```

Key changes:
- Removed `pill`, `pill-sm` sizes
- Added `ghost-accent` variant for secondary icon/action buttons
- `shadow-sm` on `default` and `destructive`
- Focus ring uses offset-1 (tighter) instead of offset-2
- `ring-2 ring-ring/40` instead of `ring-ring` (softer)

- [ ] **Step 3: Commit**

```bash
git add fb_dashboard/frontend/src/components/ui/button.jsx
git commit -m "feat(ui): clean up button variants, add ghost-accent

- remove unused pill/pill-sm sizes
- add ghost-accent variant (muted→accent hover)
- softer focus ring (offset-1, ring/40)
- shadow-sm on primary/destructive buttons

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Form Inputs Unification

**Files:**
- Modify: `src/components/ui/input.jsx`
- Modify: `src/components/ui/textarea.jsx`
- Modify: `src/components/ui/select.jsx`

**Interfaces:** Consumes: unified tokens. Produces: consistent form treatment.

- [ ] **Step 1: Update Input focus/error styles**

In `input.jsx`, change the focus-visible className to:

```jsx
"flex h-10 w-full rounded-lg border bg-background/60 backdrop-blur-sm px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-0 focus-visible:border-ring/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted/30",
```

Key: remove `text-base md:text-sm` (use consistent `text-sm`), remove `ps-3 rtl:pe-3` (unnecessary with Tailwind's RTL built-in).

- [ ] **Step 2: Same treatment for Textarea**

Same focus-visible pattern as Input. Ensure `text-sm` base.

- [ ] **Step 3: Update Select trigger**

In `select.jsx`, update the `SelectTrigger` className:

```jsx
"flex h-10 w-full items-center justify-between rounded-lg border bg-background/60 backdrop-blur-sm px-3 py-2 text-sm ring-offset-background data-[placeholder]:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring/40 focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted/30 [&>span]:line-clamp-1 transition-all cursor-pointer",
```

Key: unified focus ring with Input, consistent text-sm, same disabled state.

- [ ] **Step 4: Commit**

```bash
git add fb_dashboard/frontend/src/components/ui/input.jsx fb_dashboard/frontend/src/components/ui/textarea.jsx fb_dashboard/frontend/src/components/ui/select.jsx
git commit -m "feat(ui): unify form input focus rings and sizing

- consistent h-10, text-sm, rounded-lg, focus-visible ring
- same disabled/error patterns across Input, Textarea, Select
- tighter focus ring offset-1

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Badge Variant Cleanup

**Files:**
- Modify: `src/components/ui/badge.jsx`

**Interfaces:** Consumes: token system. Produces: cleaner badge API.

- [ ] **Step 1: Update badge variants**

Simplify — remove `subtle` variant (redundant with `outline` + `ghost` patterns), keep pure status variants:

```jsx
const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring/40 focus:ring-offset-1",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary/10 text-primary",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground",
        destructive:
          "border-transparent bg-destructive/10 text-destructive",
        outline:
          "bg-transparent text-foreground border-border/60",
        success:
          "border-transparent bg-success/10 text-[hsl(var(--success))]",
        warning:
          "border-transparent bg-warning/10 text-[hsl(var(--warning))]",
        info:
          "border-transparent bg-info/10 text-[hsl(var(--info))]",
        premium:
          "border-transparent bg-gradient-to-r from-primary/15 to-accent/15 text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)
```

Remove the subtle-variant dot and `isSubtle` logic in the `Badge` function. Keep the component simple:

```jsx
function Badge({ className, variant, children, ...props }) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props}>
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add fb_dashboard/frontend/src/components/ui/badge.jsx
git commit -m "feat(ui): simplify badge variants, remove subtle variant

- consistent text-[11px] font-medium across badges
- remove subtle variant (redundant with outline)
- unified focus ring

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Dialog & Dropdown Animation Polish

**Files:**
- Modify: `src/components/ui/dialog.jsx`
- Modify: `src/components/ui/dropdown-menu.jsx`

**Interfaces:** Consumes: token system. Produces: consistent overlay animations.

- [ ] **Step 1: Update DialogContent animation**

Replace the Radix animation classes with cleaner timing:

```jsx
const DialogContent = React.forwardRef(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg max-h-[85vh] translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-5 sm:p-6 shadow-lg overflow-y-auto rounded-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] duration-200",
        className
      )}
      {...props}>
      {children}
      <DialogPrimitive.Close className="absolute start-2 top-2 p-2 rounded-lg opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring/40 focus:ring-offset-1 disabled:pointer-events-none">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))
```

Key: `backdrop-blur-md` on overlay (was `backdrop-blur-sm`), `duration-200` on content, `ring-offset-1`.

- [ ] **Step 2: Update DropdownMenuContent**

Same pattern — ensure `ring-offset-1` on focusable items.

- [ ] **Step 3: Commit**

```bash
git add fb_dashboard/frontend/src/components/ui/dialog.jsx fb_dashboard/frontend/src/components/ui/dropdown-menu.jsx
git commit -m "feat(ui): dialog and dropdown animation polish

- stronger backdrop blur on overlay (blur-sm→blur-md)
- consistent duration-200 on animations
- tighter focus ring offset

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Empty State & Loading State Enhancement

**Files:**
- Modify: `src/components/ui/empty-state.jsx`
- Modify: `src/components/ui/loading-state.jsx`
- Modify: `src/components/ui/skeleton.jsx`

**Interfaces:** Consumes: token system. Produces: richer empty/loading states.

- [ ] **Step 1: Enhance EmptyState**

```jsx
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { Inbox } from "lucide-react"

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={cn("flex flex-col items-center justify-center py-12 text-center px-4", className)}
    >
      <div className="flex size-12 items-center justify-center rounded-2xl bg-muted/40 backdrop-blur-sm mb-4 ring-1 ring-border/20">
        <Icon className="size-6 text-muted-foreground/40" />
      </div>
      {title && <p className="text-sm font-medium text-foreground mb-1">{title}</p>}
      {description && <p className="text-xs text-muted-foreground max-w-xs mb-5 leading-relaxed">{description}</p>}
      {action && <div>{action}</div>}
    </motion.div>
  )
}
```

Changes: added `scale: 0.98` to entry animation, glass container for icon, `ring-1` border on icon container, tighter py-12, action wrapped in div for spacing.

- [ ] **Step 2: Enhance Loading State skeletons**

In `loading-state.jsx`, improve the skeleton shapes to match actual content:

```jsx
function TableRowsSkeleton({ rows = 5 }) {
  return (
    <div className="space-y-2 p-1">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 h-12 rounded-lg bg-muted/20 px-4">
          <Skeleton className="size-8 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-3/5 rounded" />
            <Skeleton className="h-2.5 w-2/5 rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add fb_dashboard/frontend/src/components/ui/empty-state.jsx fb_dashboard/frontend/src/components/ui/loading-state.jsx
git commit -m "feat(ui): enhance empty and loading states

- glass icon container with ring border for empty states
- scale animation on empty state entry
- realistic table row skeletons with avatar column

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Table Component Spacing Refinement

**Files:**
- Modify: `src/components/ui/table.jsx`
- Modify: `src/index.css` (remove `.data-table` class)

**Interfaces:** Consumes: token system. Produces: tighter, cleaner tables.

- [ ] **Step 1: Update table spacing**

In `table.jsx`, tighten cell padding:

```jsx
const TableHead = React.forwardRef(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-10 px-3 text-start align-middle font-semibold text-muted-foreground text-[11px] uppercase tracking-wider [&:has([role=checkbox])]:pe-0",
      className
    )}
    {...props} />
))
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn("p-2.5 px-3 align-middle text-sm [&:has([role=checkbox])]:pe-0", className)}
    {...props} />
))
TableCell.displayName = "TableCell"
```

Key: `h-10` (was `h-11`), `px-3` (was `px-4`), `p-2.5` (was `p-3`), `text-[11px]` (was `text-xs`).

- [ ] **Step 2: Keep `.data-table` CSS as deprecated (pages still use it)**

The `.data-table` class is still referenced in `dashboard.jsx` and other pages. Keep the CSS class block but remove the `border-radius` and `overflow` from the table itself (the `<Table>` component handles that):

Update the `.data-table` class block to use consistent token values:
- Change `th` font-size to `text-[11px]` 
- Change `td` padding to `p-2.5 px-3`
- Keep the `.data-table-card-view` responsive section unchanged

This prevents breaking existing pages while aligning with new spacing.

- [ ] **Step 3: Commit**

```bash
git add fb_dashboard/frontend/src/components/ui/table.jsx fb_dashboard/frontend/src/index.css
git commit -m "feat(ui): tighten table spacing, remove data-table CSS class

- reduce header height h-11→h-10, cell padding p-3→p-2.5
- use text-[11px] for header text
- remove .data-table class (now handled by Table component)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Dashboard Page Premium Polish

**Files:**
- Modify: `src/pages/dashboard.jsx`

**Interfaces:** Consumes: all prior tasks. Produces: premium dashboard.

- [ ] **Step 1: Update MetricCard spacing**

Replace current `p-5` inner div with `p-4` and icon container `size-10` (was `size-12`):

```jsx
function MetricCard({ title, value, subtitle, icon: Icon, color = "primary", loading, change }) {
  if (loading) return (
    <Card className="animate-pulse overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-xl shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-24" />
          </div>
        </div>
      </CardContent>
    </Card>
  )

  return (
    <motion.div initial={{opacity:0,y:24}} animate={{opacity:1,y:0}} transition={{duration:0.4,ease:[0.16,1,0.3,1]}}>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${iconColors[color]||iconColors.primary}`}>
              <Icon className="size-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-muted-foreground/80 truncate mb-1">{title}</p>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-bold font-mono tabular-nums text-xl tracking-tight">
                  <AnimatedCounter value={value||"0"} suffix="" />
                </span>
                {change!==undefined && change!==null && (
                  <span className={`text-[10px] font-semibold flex items-center gap-0.5 px-1.5 py-0.5 rounded-full ${change>=0?"bg-success/15 text-success":"bg-destructive/15 text-destructive"}`}>
                    {change>=0?<ArrowUp className="size-2.5"/>:<ArrowDown className="size-2.5"/>}
                    {Math.abs(change)}%
                  </span>
                )}
              </div>
              {subtitle && <p className="text-[11px] text-muted-foreground/60 mt-1">{subtitle}</p>}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
```

Key: `size-10` icon (was `size-12`), `text-xl` for value (was `text-2xl`), `p-4` (was `p-5`), `gap-3` (was `gap-4`), `text-[11px]` for labels, removed `card-deep`/`icon-premium`/`metric-glow` in favor of simpler Card + clean icon container.

- [ ] **Step 2: Fix WelcomeHeader background badge**

Replace the `bg-muted/50 px-3 py-1.5 rounded-full` container:

```jsx
<div className="flex items-center gap-3 text-xs text-muted-foreground bg-secondary/50 px-3 py-1.5 rounded-full border border-border/30">
```

- [ ] **Step 3: Fix grid gap and card header padding across dashboard**

Replace all `space-y-6` on the main container with `space-y-5`, and `gap-4` on metric grid with `gap-3`. Update all card header subtitles in chart and activity sections.

- [ ] **Step 4: Fix the PremiumChart y-axis width**

Change `width={28}` to `width={32}` to prevent axis label clipping.

- [ ] **Step 5: Remove `card-deep` reference in dashboard**

Ensure no remaining references to `card-deep`, `icon-premium`, `metric-glow` anywhere in the dashboard page. These are now replaced by the base Card + utility classes.

- [ ] **Step 6: Commit**

```bash
git add fb_dashboard/frontend/src/pages/dashboard.jsx
git commit -m "feat(ui): premium dashboard polish — tighter metrics, cleaner hierarchy

- metric cards: size-10 icons, text-xl values, p-4 padding
- remove card-deep/icon-premium/metric-glow (now Card-based)
- consistent gap-3 grid, space-y-5 sections
- secondary/50 pill for status indicators
- fix chart y-axis width to prevent clipping

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Responsive Pass & Cross-Page Consistency

**Files:**
- Modify: `src/pages/dashboard.jsx` (already done)
- Read: `src/pages/login.jsx`
- Read: `src/pages/settings.jsx`
- Read: `src/pages/users.jsx`
- Read: `src/pages/messages.jsx`
- Modify: all pages — fix padding, overflow, consistent card usage

**Interfaces:** Consumes: all prior tasks. Produces: consistent responsive behavior across all pages.

- [ ] **Step 1: Audit pages for `.content-container` usage**

Check all 28 pages for:
- Are they using `.content-container` as the outer wrapper? If not, they should.
- Are they mixing `p-4`/`p-5`/`p-6`? Fix to consistent padding (`.p-5` on cards, `.content-container` for page wrapper).

- [ ] **Step 2: Fix overflow issues**

Check for `overflow-x: auto` on data tables, `text-overflow: ellipsis` on long text in table cells. Add `min-w-0` to flex children where content might overflow.

- [ ] **Step 3: Standardize section header pattern**

All page section headers should follow:
```jsx
<div className="flex items-center gap-2">
  <div className="size-7 rounded-lg bg-accent/10 flex items-center justify-center">
    <Icon className="size-3.5 text-accent" />
  </div>
  <h2 className="text-[15px] font-semibold tracking-tight">Section Title</h2>
</div>
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(ui): responsive pass — consistent spacing across all pages

- standardize section headers with icon containers
- fix overflow clipping in table cells
- consistent .content-container and card spacing
- mobile layout fixes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Visual QA — Build, Smoke Test, Fix

**Files:** All modified files.

**Interfaces:** Consumes: all tasks. Produces: verified production build.

- [ ] **Step 1: Production build**

```bash
cd fb_dashboard/frontend && npm run build
```

Expected: build succeeds, output in `../static/assets/`.

- [ ] **Step 2: Check for console errors**

Start the dev server:
```bash
cd fb_dashboard/frontend && npx vite --host
```

Open the app, check browser console for errors (no `card-deep` class not found, no missing imports).

- [ ] **Step 3: Verify dark/light mode toggle works**

No errors when switching themes. All tokens resolve properly in both modes.

- [ ] **Step 4: Verify sidebar collapse works**

Check that the CSS width transition is smooth, no layout shift.

- [ ] **Step 5: Fix any issues found**

If any components reference removed classes (`card-deep`, `icon-premium`, `metric-glow`, `glass-card`, etc.), update them.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "fix(ui): visual QA fixes — remove stale class references, fix padding

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
