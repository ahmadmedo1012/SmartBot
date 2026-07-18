"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

const pageSpring = {
  type: "spring" as const,
  stiffness: 250,
  damping: 22,
  mass: 0.9,
};

export default function PageFade({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={pageSpring}
    >
      {children}
    </motion.div>
  );
}
