import { useState, useEffect, useCallback } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Toaster } from "sonner"
import { ThemeProvider } from "@/components/theme-provider"
import { Topbar } from "@/components/topbar"
import { ErrorBoundary } from "@/components/error-boundary"
import { AnimatePresence, motion } from "framer-motion"
import { fetchMe, logout as apiLogout } from "@/lib/api"
import { Login } from "@/pages/login"
import { Dashboard } from "@/pages/dashboard"
import { Analytics } from "@/pages/analytics"
import { Rules } from "@/pages/rules"
import { Replies } from "@/pages/replies"
import { Posts } from "@/pages/posts"
import { Settings } from "@/pages/settings"
import { FbControl } from "@/pages/fb-control"
import { Users } from "@/pages/users"
import { Messages } from "@/pages/messages"
import { Ads } from "@/pages/ads"
import { Webhook } from "@/pages/webhook"

const queryClient = new QueryClient()

const pages = {
  dashboard: Dashboard,
  analytics: Analytics,
  rules: Rules,
  replies: Replies,
  posts: Posts,
  facebook: FbControl,
  messages: Messages,
  ads: Ads,
  settings: Settings,
  webhook: Webhook,
  users: Users,
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
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!auth) {
    return <Login onAuth={handleLogin} />
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
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={page}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              >
                <Page role={role} />
              </motion.div>
            </AnimatePresence>
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
