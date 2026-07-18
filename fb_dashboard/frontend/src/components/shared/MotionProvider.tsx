"use client"

import { MotionConfig } from "framer-motion"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import { pageVariants } from "@/lib/motion"
import { motion } from "framer-motion"

export function MotionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  // ponytail: useHydrated — prevents key mismatch between server (null) and client (real pathname)
  // that causes React to unmount the entire DOM tree on first hydrate (blank screen until reload).
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => { setHydrated(true) }, [])

  if (!hydrated) return <>{children}</>

  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        key={pathname}
        variants={pageVariants}
        initial="initial"
        animate="animate"
      >
        {children}
      </motion.div>
    </MotionConfig>
  )
}
