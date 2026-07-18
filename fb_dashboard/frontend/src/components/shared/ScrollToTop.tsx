"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

/** Navigation progress bar — shows briefly on route change */
function ProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => setLoading(false), 400);
    return () => clearTimeout(timer);
  }, [pathname, searchParams]);

  return (
    <div className="fixed top-0 inset-x-0 z-[90] h-0.5">
      <div
        className={cn(
          "h-full bg-gradient-to-r from-orange to-orange/80 transition-all duration-500 ease-out",
          loading ? "w-full opacity-100" : "w-0 opacity-0",
        )}
      />
    </div>
  );
}

/** Scroll-to-top button */
function ScrollButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={cn(
        "fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] start-4 sm:start-6 z-[61] size-11 rounded-md bg-gradient-to-r from-orange to-orange/80 text-white shadow-lg shadow-orange/25 hover:shadow-xl hover:shadow-orange/30 hover:scale-105 transition-all duration-300 flex items-center justify-center",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none",
      )}
      aria-label="Back to top"
    >
      <ChevronUp className="size-5" />
    </button>
  );
}

export default function ScrollToTop() {
  return (
    <Suspense fallback={null}>
      <ProgressBar />
      <ScrollButton />
    </Suspense>
  );
}
