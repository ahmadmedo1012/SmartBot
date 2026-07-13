import { lazy, Suspense, useState, useEffect, useCallback, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Analytics } from "@vercel/analytics/react"
import { Toaster, toast } from "sonner"
import { Topbar } from "@/components/topbar"
import { ErrorBoundary } from "@/components/error-boundary"
import { NotificationsProvider, useNotifications } from "@/hooks/use-notifications"
import { RefreshProvider } from "@/hooks/use-refresh-engine"
import { fetchMe, logout as apiLogout } from "@/lib/api"
import { Dashboard } from "@/pages/dashboard"
import { Landing } from "@/pages/landing"

const pageSlide = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 260, damping: 24, mass: 0.6 } },
  exit: { opacity: 0, y: -4, transition: { duration: 0.12 } },
}

const PAGES_GLOB = import.meta.glob("./pages/[ab-cef-z]*.jsx", { eager: false })
// ponytail: dashboard excluded from glob — statically imported as default fallback
const EXPORT_OVERRIDES = { scheduled: "ScheduledPosts", calendar: "ContentCalendar" }

const toPascal = (str) => str.split("-").map(s => s.charAt(0).toUpperCase() + s.slice(1)).join("")
const pageModules = {}
for (const [path, loader] of Object.entries(PAGES_GLOB)) {
  const key = path.replace("./pages/", "").replace(".jsx", "")
  const exportName = EXPORT_OVERRIDES[key] || toPascal(key)
  pageModules[key] = lazy(() => loader().then(m => ({ default: m[exportName] })))
}

const queryClient = new QueryClient()

function PageLoader() {
  return (
    <div className="min-h-[200px] flex flex-col items-center justify-center gap-6 p-8">
      <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      <div className="w-full max-w-md space-y-3">
        <div className="skeleton skeleton-text" />
        <div className="skeleton skeleton-text" style={{ width: "85%" }} />
        <div className="skeleton skeleton-text" style={{ width: "60%" }} />
      </div>
    </div>
  )
}

const pages = pageModules

function ToastBridge() {
  const { notifications } = useNotifications()
  const shown = useRef(new Set())
  useEffect(() => {
    for (const n of notifications) {
      if (shown.current.has(n.id)) continue
      shown.current.add(n.id)
      const fn = n.type === "error" ? toast.error : n.type === "warning" ? toast.warning : n.type === "success" || n.type === "reply" ? toast.success : toast.info
      fn(n.title, { description: n.message, duration: 5000, important: true })
    }
    if (shown.current.size > 100) shown.current.clear()
  }, [notifications])
  return <Toaster position="top-left" richColors closeButton duration={5000} />
}

function AppInner() {
  const [auth, setAuth] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [page, setPage] = useState(() => {
    const hash = window.location.hash.replace("#", "") || "dashboard"
    return hash
  })

  // navigate function — syncs hash with page state
  const navigate = useCallback((pageKey) => {
    setPage(pageKey)
    window.location.hash = pageKey
    document.title = `SmartBot — ${pageNames[pageKey] || pageKey}`
  }, [])

  // Listen for hash changes (browser back/forward)
  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.replace("#", "") || "dashboard"
      setPage(hash)
    }
    window.addEventListener("hashchange", onHashChange)
    return () => window.removeEventListener("hashchange", onHashChange)
  }, [])

  useEffect(() => {
    fetchMe()
      .then((u) => setAuth(u))
      .catch(() => {
        setAuth(null)
        // Show landing page on root, login otherwise
        if (window.location.hash === "#login") setPage("login")
        else setPage("landing")
      })
      .finally(() => setAuthLoading(false))
  }, [])

  useEffect(() => {
    document.querySelector(".content")?.scrollTo({ top: 0 })
  }, [page])

  const handleLogin = useCallback((res) => {
    setAuth({ username: res.username, role: res.role })
    navigate("dashboard")
  }, [navigate])

  const handleLogout = useCallback(async () => {
    try { await apiLogout() } catch {}
    setAuth(null)
  }, [])

  if (authLoading) {
    return (
      <div className="loading-screen">
        <div className="grain-overlay" />
        <div className="relative flex flex-col items-center gap-6">
          <div className="loading-logo">
            <div className="loading-ring" />
            <img src="/static/brand-icon.png" alt="SmartBot" className="w-8 h-8 object-contain" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-[var(--fg)] tracking-tight">SmartBot</h1>
            <p className="loading-text mt-1">جاري التحميل...</p>
          </div>
          <div className="flex gap-1.5">
            {[0,1,2].map(i => (
              <div key={i} className="w-2 h-2 rounded-full bg-[var(--accent)]" style={{ animation: "pulse-dot 2s var(--ease) infinite", animationDelay: `${i*0.15}s` }} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!auth) {
    if (page === "landing") {
      return <Landing onGetStarted={() => { window.location.hash = "#login"; setPage("login") }} onNavigate={navigate} />
    }
    const Login = lazy(() => import("@/pages/login").then(m => ({ default: m.Login })))
    return (
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[var(--bg)]"><div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" /></div>}>
        <Login onAuth={handleLogin} />
      </Suspense>
    )
  }

  const Page = pages[page] || Dashboard
  const role = auth.role

  return (
    <NotificationsProvider>
      <RefreshProvider queryClient={queryClient}>
        <Topbar
          currentPage={page}
          onNavigate={navigate}
          username={auth.username}
          role={role}
          onLogout={handleLogout}
        >
          <div className="grain-overlay" />
          <main className="content">
            <ErrorBoundary key={page}>
              <AnimatePresence mode="wait">
                <motion.div key={page} variants={pageSlide} initial="initial" animate="animate" exit="exit" style={{ minHeight: 200 }}>
                  <Suspense fallback={<PageLoader />}>
                    <Page role={role} />
                  </Suspense>
                </motion.div>
              </AnimatePresence>
            </ErrorBoundary>
          </main>
        </Topbar>
        <div aria-live="polite" aria-atomic="false"><ToastBridge /></div>
      </RefreshProvider>
    </NotificationsProvider>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AppInner />
        <Analytics />
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

const pageNames = {
  dashboard: "لوحة البيانات", messages: "الرسائل", comments: "التعليقات",
  posts: "المنشورات", scheduled: "المجدول", analytics: "التحليلات",
  audience: "الجمهور", leads: "العملاء المتوقعون", ads: "الإعلانات",
  broadcast: "البث الجماعي", marketing: "التسويق", reports: "التقارير",
  pages: "الصفحات", team: "الفريق", calendar: "تقويم المحتوى",
  autoreply: "الردود التلقائية", activity: "سجل النشاطات",
  notifications: "الإشعارات", tools: "الأدوات", billing: "الفواتير",
  support: "الدعم", settings: "الإعدادات",
}

export default App
