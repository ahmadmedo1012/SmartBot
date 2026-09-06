"use client"

import dynamic from "next/dynamic"
import { Suspense } from "react"
import { Loader2 } from "lucide-react"

/* v6 §D — SSR ON (was ssr:false): /subscribe is a public sitemap URL; the
 * crawler-visible shell + faster first paint matter, and the content is
 * harmless pre-auth (plans are public, payment is 401-gated at submit). */
const SubscribeContent = dynamic(() => import("./SubscribeContent"))

export default function SubscribePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      }
    >
      <span id="page-content" className="sr-only" tabIndex={-1} />
      <SubscribeContent />
    </Suspense>
  )
}
