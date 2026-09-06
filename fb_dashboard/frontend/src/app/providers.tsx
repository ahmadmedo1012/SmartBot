"use client"

import { ThemeProvider } from "next-themes"
import dynamic from "next/dynamic"
import { ReactNode } from "react"

/* v12-E5.1/E5.2/E5.3 — the root providers went on a diet:
 *
 * 1. MotionConfig (framer-motion) REMOVED — it dragged the ~116KB motion
 *    engine into the shared base chunk of EVERY route (public pages
 *    included) for animations only 2 lazy components actually used.
 *    The eager routes now use the CSS twins in
 *    components/shared/enter-motion.css; the only JS-motion consumer
 *    left (OnboardingWizard) wraps its own root in MotionConfig —
 *    it is dynamic(ssr:false) via AuthGuard, so framer stays in ITS
 *    lazy chunk only.
 * 2. QueryClientProvider REMOVED — react-query was only consumed under
 *    /dashboard (22 pages) + /admin (telegram). It now mounts in those
 *    layouts via components/shared/QueryProvider, so public routes
 *    (landing/pricing/login/register/…) stop shipping it entirely.
 * 3. AppToaster (sonner) is now a client-only dynamic import mounted
 *    here — ssr:false is not allowed in server components, and this
 *    file is already the client boundary. The toaster chunk loads
 *    after first paint; toasts are user-event driven (clicks /
 *    mutations) so nothing can fire before it mounts.
 *
 * The ThemeProvider stays exactly as it was (attribute/defaultTheme/
 * enableSystem/disableTransitionOnChange) — same props, just owned
 * here so layout.tsx stays a pure server component. */
const AppToaster = dynamic(
  () => import("@/components/ui/app-toaster").then((m) => m.AppToaster),
  { ssr: false },
)

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      {children}
      <AppToaster />
    </ThemeProvider>
  )
}
