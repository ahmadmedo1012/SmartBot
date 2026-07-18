"use client";

import { useState, useEffect, useRef } from "react";
import { motion, useInView } from "framer-motion";
import { springSnappy } from "@/lib/motion";
import { SectionContainer } from "@/components/ui/SectionContainer";

function AnimatedNumber({ value }: { value: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  useEffect(() => {
    if (!inView || value <= 0) return;
    const step = Math.max(1, Math.ceil(value / 30));
    const timer = setInterval(() => {
      setCount(prev => Math.min(prev + step, value));
    }, 30);
    return () => clearInterval(timer);
  }, [value]);
  return <span ref={ref} dir="ltr">{count.toLocaleString()}</span>;
}

export default function StatsSection() {
  const items = [
    { value: 500, suffix: "+", label: "صفحة نشطة" },
    { value: 50000, suffix: "+", label: "رد تلقائي" },
    { value: 98, suffix: "%", label: "معدل رضا" },
    { value: 24, suffix: "/7", label: "دعم فني" },
  ];

  return (
    <SectionContainer>
      <div className="glass-strong rounded-2xl mx-auto max-w-4xl p-6 sm:p-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-5 lg:gap-6">
          {items.map((item, i) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ ...springSnappy, delay: i * 0.1 }}
            >
              <div className="text-center">
                <div className="text-[2.25rem] sm:text-[2.75rem] md:text-[3.25rem] font-bold leading-none mb-2">
                  <span className="text-orange">
                    <AnimatedNumber value={item.value} />{item.suffix}
                  </span>
                </div>
                <div className="text-xs sm:text-sm font-medium text-muted-foreground/80">{item.label}</div>
              </div>
            </motion.div>
          ))}
        </div>
        <div className="mx-auto mt-6 w-16 h-[2px] rounded-full bg-gradient-to-r from-orange/0 via-orange to-orange/0" />
      </div>
    </SectionContainer>
  );
}
