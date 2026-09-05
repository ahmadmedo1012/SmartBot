"use client"

import { useEffect, useState } from "react"

/* Ported from Smart-Menu (smart-link.ly shared identity) — same
   module-level TTL cache + inflight dedup. One adaptation: SmartBot's
   GET /api/config returns {success, data: {key: value}} (a flat dict),
   while Smart-Menu returns an array of {key, value} rows. */

interface ConfigMap {
  [key: string]: string | number | boolean | null
}

export type ConfigState = {
  config: ConfigMap
  loaded: boolean
  error: string | null
}

const TTL = 60_000
let cache: { data: ConfigMap; ts: number } | null = null
let inflight: Promise<void> | null = null

function fresh(): boolean {
  return cache !== null && Date.now() - cache.ts < TTL
}

export function useConfig(): ConfigState {
  const [config, setConfig] = useState<ConfigMap>(fresh() ? cache!.data : {})
  const [loaded, setLoaded] = useState(fresh())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (fresh()) return

    let cancelled = false

    async function load() {
      if (inflight) {
        await inflight
        if (!cancelled) {
          if (cache) setConfig(cache.data)
          setLoaded(true)
        }
        return
      }

      inflight = (async () => {
        try {
          const res = await fetch("/api/config")
          const d = await res.json()
          if (d.success && d.data && typeof d.data === "object") {
            cache = { data: d.data as ConfigMap, ts: Date.now() }
            if (!cancelled) setConfig(d.data as ConfigMap)
          }
        } catch (e: unknown) {
          if (cache && !fresh()) cache = null
          if (!cancelled) {
            setError(e instanceof Error ? e.message : "Failed to load config")
          }
        } finally {
          inflight = null
          if (!cancelled) setLoaded(true)
        }
      })()

      await inflight
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return { config, loaded, error }
}
