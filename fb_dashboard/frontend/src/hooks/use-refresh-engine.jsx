import { createContext, useContext, useCallback, useState, useEffect, useRef } from "react"

const PRIORITIES = { critical: 5000, normal: 15000, background: 30000 }

const RefreshCtx = createContext(null)

export function RefreshProvider({ children, queryClient }) {
  const [visible, setVisible] = useState(true)
  const [lastActive, setLastActive] = useState(Date.now())
  const paused = useRef(new Set())
  const sseRef = useRef(null)

  // Page Visibility API
  useEffect(() => {
    const onVis = () => {
      const v = !document.hidden
      setVisible(v)
      if (v) {
        setLastActive(Date.now())
        // on return: invalidate all stale queries immediately
        queryClient.invalidateQueries({ refetchType: "inactive", predicate: (q) => q.isStale })
      }
    }
    document.addEventListener("visibilitychange", onVis)
    return () => document.removeEventListener("visibilitychange", onVis)
  }, [queryClient])

  // SSE connection for server-pushed events
  useEffect(() => {
    const proto = location.protocol === "https:" ? "https:" : "http:"
    const es = new EventSource(`${proto}//${location.host}/api/events`)
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.event === "stats_update") {
          queryClient.setQueryData(["stats"], (old) => old ? { ...old, ...msg.data } : msg.data)
          queryClient.invalidateQueries({ queryKey: ["stats"] })
        } else if (msg.event === "new_reply") {
          queryClient.invalidateQueries({ queryKey: ["stats"] })
          queryClient.invalidateQueries({ queryKey: ["replies"] })
          queryClient.invalidateQueries({ queryKey: ["recent-activity"] })
        } else if (msg.event === "bot_status") {
          queryClient.setQueryData(["bot-status"], msg.data)
        }
      } catch {}
    }
    es.onerror = () => {} // auto-reconnect by EventSource spec
    sseRef.current = es
    return () => es.close()
  }, [queryClient])

  const refreshNow = useCallback((key) => {
    queryClient.invalidateQueries({ queryKey: Array.isArray(key) ? key : [key] })
  }, [queryClient])

  const pauseRefresh = useCallback((key) => {
    paused.current.add(Array.isArray(key) ? key.join("::") : key)
  }, [])

  const resumeRefresh = useCallback((key) => {
    paused.current.delete(Array.isArray(key) ? key.join("::") : key)
  }, [])

  const isPaused = useCallback((key) => {
    return paused.current.has(Array.isArray(key) ? key.join("::") : key)
  }, [])

  const ctx = { isPageVisible: visible, lastActiveTimestamp: lastActive, refreshNow, pauseRefresh, resumeRefresh, isPaused, priorities: PRIORITIES }

  return <RefreshCtx.Provider value={ctx}>{children}</RefreshCtx.Provider>
}

export function useRefresh() {
  const ctx = useContext(RefreshCtx)
  if (!ctx) throw new Error("useRefresh must be used within RefreshProvider")
  return ctx
}

export function useAdaptiveInterval(priority = "normal") {
  const { isPageVisible, priorities } = useRefresh()
  const ms = priorities[priority] || priorities.normal
  if (!isPageVisible) return false
  return ms
}
