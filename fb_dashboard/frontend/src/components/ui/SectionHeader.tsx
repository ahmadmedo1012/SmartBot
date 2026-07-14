"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { springGentle, springSnappy } from "@/lib/motion"

interface SectionHeaderProps {
  eyebrow?: string
  title: string
  subtitle?: React.ReactNode
  description?: React.ReactNode
  icon?: React.ReactNode
  className?: string
}

export function SectionHeader({ eyebrow, title, subtitle, description, icon, className }: SectionHeaderProps) {
  const desc = subtitle || description
  return (
    <div className={cn("text-center mb-16", className)}>
      {eyebrow && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ ...springGentle, delay: 0.08 }}
        >
          <div className="eyebrow">
            {icon && icon}
            {eyebrow}
          </div>
        </motion.div>
      )}
      {title && (
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ ...springGentle, delay: 0.16 }}
          className="text-3xl md:text-4xl font-extrabold mb-4 tracking-tighter"
        >
          {title}
        </motion.h2>
      )}
      {desc && (
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ ...springSnappy, delay: 0.24 }}
          className="text-base max-w-2xl mx-auto text-muted-foreground"
        >
          {desc}
        </motion.p>
      )}
    </div>
  )
}
