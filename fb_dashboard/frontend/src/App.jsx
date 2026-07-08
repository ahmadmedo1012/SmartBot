import { Suspense, useState, useEffect, useCallback } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Toaster } from "sonner"
import { ThemeProvider } from "@/components/theme-provider"
import { Topbar } from "@/components/topbar"
import { ErrorBoundary } from "@/components/error-boundary"
import { fetchMe, logout as apiLogout } from "@/lib/api"
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

const queryClient = new QueryClient()

function PageLoader() {
  return (
    <div className="min-h-[200px] flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

const pages = {
  dashboard: Dashboard,
  rules: Rules,
  replies: Replies,
  posts: Posts,
  messages: Messages,
  reports: Reports,
  offers: Offers,
  comments: Comments,
  ads: Ads,
  settings: Settings,
  users: Users,
  scheduled: ScheduledPosts,
  "quick-replies": QuickReplies,
  "ai-assistant": AiAssistant,
  flows: Flows,
  sequences: Sequences,
  broadcast: Broadcast,
  subscribers: Subscribers,
  "analytics-dashboard": AnalyticsDashboard,
  "content-calendar": ContentCalendar,
  team: Team,
  insights: Insights,
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

  // WebSocket real-time updates
  useEffect(() => {
    if (!auth) return
    let ws = null
    let timer = null
    let mounted = true

    function connect() {
      const proto = location.protocol === "https:" ? "wss:" : "ws:"
      ws = new WebSocket(`${proto}//${location.host}/ws`)
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.event === "new_reply") {
            queryClient.invalidateQueries({ queryKey: ["stats"] })
            queryClient.invalidateQueries({ queryKey: ["replies"] })
            queryClient.invalidateQueries({ queryKey: ["recent-activity"] })
          }
        } catch {}
      }
      ws.onclose = () => { if (mounted) timer = setTimeout(connect, 5000) }
      ws.onerror = () => ws?.close()
    }
    connect()
    return () => { mounted = false; if (ws) ws.close(); clearTimeout(timer) }
  }, [auth])

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
      <ThemeProvider defaultTheme="dark" storageKey="smartbot-theme">
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </ThemeProvider>
    )
  }

  if (!auth) {
    return (
      <ThemeProvider defaultTheme="dark" storageKey="smartbot-theme">
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
          <Login onAuth={handleLogin} />
        </Suspense>
      </ThemeProvider>
    )
  }

  const Page = pages[page] || Dashboard
  const role = auth.role

  return (
    <ThemeProvider defaultTheme="dark" storageKey="smartbot-theme">
    <div className="min-h-svh w-full" dir="rtl">
        <Topbar
          currentPage={page}
          onNavigate={setPage}
          username={auth.username}
          role={role}
          onLogout={handleLogout}
        />
        <main className="flex-1 overflow-y-auto">
          <div className="content-container">
            <Suspense fallback={<PageLoader />}>
              <Page role={role} />
            </Suspense>
          </div>
        </main>
        <Toaster position="top-left" richColors />
      </div>
    </ThemeProvider>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AppInner />
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
