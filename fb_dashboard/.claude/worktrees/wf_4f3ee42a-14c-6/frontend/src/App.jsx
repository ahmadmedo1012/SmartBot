import { useState, useEffect, useCallback, lazy, Suspense } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Toaster } from "sonner"
import { ThemeProvider } from "@/components/theme-provider"
import { Topbar } from "@/components/topbar"
import { ErrorBoundary } from "@/components/error-boundary"
import { fetchMe, logout as apiLogout } from "@/lib/api"

const Login = lazy(() => import("@/pages/login"))
const Dashboard = lazy(() => import("@/pages/dashboard"))
const Analytics = lazy(() => import("@/pages/analytics"))
const Rules = lazy(() => import("@/pages/rules"))
const Replies = lazy(() => import("@/pages/replies"))
const Posts = lazy(() => import("@/pages/posts"))
const Settings = lazy(() => import("@/pages/settings"))
const FbControl = lazy(() => import("@/pages/fb-control"))
const Users = lazy(() => import("@/pages/users"))
const Messages = lazy(() => import("@/pages/messages"))
const Ads = lazy(() => import("@/pages/ads"))

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
    return (
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-900"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
        <Login onAuth={handleLogin} />
      </Suspense>
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
            <Suspense fallback={<div className="min-h-40 flex items-center justify-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
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
