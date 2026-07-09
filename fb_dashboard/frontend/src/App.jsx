import { Suspense, useState, useEffect, useCallback, useRef } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Toaster, toast } from "sonner"
import { ThemeProvider } from "@/components/theme-provider"
import { Topbar } from "@/components/topbar"
import { ErrorBoundary } from "@/components/error-boundary"
import { NotificationsProvider, useNotifications } from "@/hooks/use-notifications"
import { RefreshProvider } from "@/hooks/use-refresh-engine"
import { fetchMe, logout as apiLogout } from "@/lib/api"
import { MotionConfig } from "framer-motion"
import { Login } from "@/pages/login"
import { Dashboard } from "@/pages/dashboard"
import { Rules } from "@/pages/rules"
import { Replies } from "@/pages/replies"
import { Posts } from "@/pages/posts"
import { Messages } from "@/pages/messages"
import { Ads } from "@/pages/ads"
import { Settings } from "@/pages/settings"
import { Users } from "@/pages/users"
import { ScheduledPosts } from "@/pages/scheduled"
import { QuickReplies } from "@/pages/quick-replies"
import { AiAssistant } from "@/pages/ai-assistant"
import { Reports } from "@/pages/reports"
import { Offers } from "@/pages/offers"
import { Comments } from "@/pages/comments"
import { Flows } from "@/pages/flows"
import { Sequences } from "@/pages/sequences"
import { Broadcast } from "@/pages/broadcast"
import { Insights } from "@/pages/insights"
import { AnalyticsDashboard } from "@/pages/analytics-dashboard"
import { ContentCalendar } from "@/pages/content-calendar"
import { Team } from "@/pages/team"
import { Subscribers } from "@/pages/subscribers"
import { LiveLogs } from "@/pages/live-logs"
import { AgentChat } from "@/pages/agent-chat"
import { AnimatePresence, motion } from "framer-motion"
import { AnimatedBackground } from "@/components/AnimatedBackground"

const queryClient = new QueryClient()

function PageLoader() {
  return (
    <div className="min-h-[200px] flex flex-col items-center justify-center gap-6 p-8">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      <div className="w-full max-w-md space-y-3">
        <div className="skeleton skeleton-text" />
        <div className="skeleton skeleton-text" style={{ width: "85%" }} />
        <div className="skeleton skeleton-text" style={{ width: "60%" }} />
      </div>
    </div>
  )
}

const pages = {
  dashboard: Dashboard, rules: Rules, replies: Replies,
  posts: Posts, messages: Messages, reports: Reports,
  offers: Offers, comments: Comments, ads: Ads,
  settings: Settings, users: Users, scheduled: ScheduledPosts,
  "quick-replies": QuickReplies, "ai-assistant": AiAssistant,
  flows: Flows, sequences: Sequences, broadcast: Broadcast,
  subscribers: Subscribers, "analytics-dashboard": AnalyticsDashboard,
  "content-calendar": ContentCalendar, team: Team,
  insights: Insights, "live-logs": LiveLogs, "agent-chat": AgentChat,
}

function ToastBridge() {
  const { notifications } = useNotifications()
  const prevLen = useRef(0)
  useEffect(() => {
    if (notifications.length === 0) { prevLen.current = 0; return }
    if (notifications.length > prevLen.current) {
      const n = notifications[0]
      const fn = n.type === "error" ? toast.error : n.type === "warning" ? toast.warning : n.type === "success" || n.type === "reply" ? toast.success : toast.info
      fn(n.title, { description: n.message, duration: 5000, important: true })
    }
    prevLen.current = notifications.length
  }, [notifications])
  return <Toaster position="top-left" richColors closeButton duration={5000} />
}

function AppInner() {
  const [auth, setAuth] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [page, setPage] = useState("dashboard")

  useEffect(() => {
    fetchMe()
      .then((u) => setAuth(u))
      .catch(() => setAuth(null))
      .finally(() => setAuthLoading(false))
  }, [])

  // SSE real-time updates
  useEffect(() => {
    if (!auth) return
    let es
    function connect() {
      es = new EventSource("/api/events")
      es.addEventListener("stats_update", () => {
        queryClient.invalidateQueries({ queryKey: ["stats"] })
      })
      es.addEventListener("agent_message", () => {
        queryClient.invalidateQueries({ queryKey: ["stats"] })
        queryClient.invalidateQueries({ queryKey: ["replies"] })
        queryClient.invalidateQueries({ queryKey: ["recent-activity"] })
      })
      es.onerror = () => {
        es.close()
        setTimeout(connect, 3000)
      }
    }
    connect()
    return () => es?.close()
  }, [auth])

  // Scroll to top on page change — target main content container
  useEffect(() => {
    document.querySelector('main')?.scrollTo({ top: 0, behavior: "smooth" })
  }, [page])

  const handleLogin = useCallback((res) => {
    setAuth({ username: res.username, role: res.role })
    setPage("dashboard")
  }, [])

  const handleLogout = useCallback(async () => {
    try { await apiLogout() } catch {}
    setAuth(null)
  }, [])

  if (authLoading) {
    return (
        <div className="loading-screen">
          <div className="loading-grid" />
          <div className="relative flex flex-col items-center gap-6">
            <div className="loading-logo">
              <div className="loading-ring" />
              <span className="text-2xl font-bold text-white">S</span>
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-bold text-foreground tracking-tight">SmartBot</h1>
              <p className="text-sm text-muted-foreground mt-1">جاري تحميل لوحة التحكم...</p>
            </div>
            <div className="flex gap-1.5">
              {[0,1,2].map(i => (
                <motion.div key={i} className="w-2 h-2 rounded-full bg-accent/60" animate={{y:[0,-6,0]}} transition={{duration:.6,repeat:Infinity,delay:i*0.15,ease:"easeInOut"}} />
              ))}
            </div>
          </div>
        </div>
    )
  }

  if (!auth) {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
          <Login onAuth={handleLogin} />
        </Suspense>
    )
  }

  const Page = pages[page] || Dashboard
  const role = auth.role

  return (
      <NotificationsProvider>
      <div className="min-h-screen bg-noise">
        <AnimatedBackground aria-hidden="true" />
        <a href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:right-4 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-card focus:text-foreground focus:border focus:rounded-lg focus:shadow-lg focus:outline-2 focus:outline-ring">
          تخطى إلى المحتوى الرئيسي
        </a>
        <div className="relative z-10">
        <Topbar
          currentPage={page}
          onNavigate={setPage}
          username={auth.username}
          role={role}
          onLogout={handleLogout}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            >
              <ErrorBoundary key={page}>
                <Suspense fallback={<PageLoader />}>
                  <Page role={role} />
                </Suspense>
              </ErrorBoundary>
            </motion.div>
          </AnimatePresence>
        </Topbar>
        <ToastBridge />
        </div>
      </div>
      </NotificationsProvider>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark" storageKey="smartbot-theme">
        <MotionConfig reducedMotion="user">
        <QueryClientProvider client={queryClient}>
          <RefreshProvider queryClient={queryClient}>
            <AppInner />
          </RefreshProvider>
        </QueryClientProvider>
        </MotionConfig>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App
