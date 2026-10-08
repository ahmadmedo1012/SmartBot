"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Menu, X, ChevronDown, ArrowLeft, Route, Bot, BarChart3, Share2 } from "lucide-react";

/* r128 Stage B (F3b) — the landing header, converted from the product's
 * flat 3-link pill to the canonical Madarek chrome (PORT-KIT §4):
 * · persistent sticky header — solid ink-2 @ 92% once scrolled, hairline
 *   edge, NO glass blur anywhere;
 * · `.scrolled` + the top progress ribbon's `--p` are written
 *   imperatively (one passive scroll listener → one rAF → DOM writes);
 *   React NEVER re-renders for scrolling (zero setState);
 * · scroll-spy (r128 R2): IntersectionObserver thresholds [0,.35,.5,.65,1],
 *   rootMargin -20% 0px -40% 0px, candidates ratio > .35, winner by most
 *   viewport coverage → header.dataset.activeSection (the landing.css
 *   rules read it there);
 * · megamenu with tone-coded icon wells (Escape + onBlur close, focus
 *   return to the trigger) replacing the flat 3-link pill;
 * · burger + mobile drawer ≤1080px (r129: aligned to the canonical
 *   breakpoint, was 1024).
 * The product Header keeps serving every non-landing surface. */

const SPY_SECTIONS = "#trust, #features, #journey, #progress, #plate, #roles";

export function LandingHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [megamenuOpen, setMegamenuOpen] = useState(false);
  const megamenuTriggerRef = useRef<HTMLButtonElement>(null);
  /* Scroll chrome lives on refs and is written imperatively below — a React
   * re-render per scroll event was the canonical round-3 regression. */
  const headerRef = useRef<HTMLElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  /* Scroll-driven chrome with ZERO setState: coalesced to one rAF per frame
   * (pending-flag pattern, mirrors useSectionProgress) and written straight
   * to the DOM — the .scrolled class on the header and the --p var on the
   * top ribbon. */
  useEffect(() => {
    const header = headerRef.current;
    const bar = progressBarRef.current;

    let raf = 0;
    const apply = () => {
      raf = 0;
      const y = window.scrollY;
      if (header) header.classList.toggle("scrolled", y > 6);
      if (bar) {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const p = max > 0 ? Math.min(1, y / max) : 0;
        bar.style.setProperty("--p", p.toFixed(4));
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };

    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  /* Scroll-spy — active section highlight in the nav. Zero setState: written
   * to a data attribute on the header via imperative DOM. */
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const sections = Array.from(document.querySelectorAll<HTMLElement>(SPY_SECTIONS));
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        /* Collect all entries first, then pick the one with most overlap. */
        const visible: Array<{ id: string; ratio: number }> = [];
        for (const entry of entries) {
          if (entry.intersectionRatio > 0.35) {
            visible.push({ id: entry.target.id, ratio: entry.intersectionRatio });
          }
        }
        /* Pick the section with the most viewport coverage; tie-break by order. */
        visible.sort((a, b) => b.ratio - a.ratio);
        if (visible.length > 0) {
          header.dataset.activeSection = visible[0]!.id;
        } else {
          delete header.dataset.activeSection;
        }
      },
      { threshold: [0, 0.35, 0.5, 0.65, 1], rootMargin: "-20% 0px -40% 0px" },
    );

    for (const s of sections) observer.observe(s);

    return () => observer.disconnect();
  }, []);

  /* Megamenu: Escape closes with focus return; blur outside the group closes. */
  const closeMegamenu = () => setMegamenuOpen(false);

  return (
    <>
      {/* Top scroll-progress bar — driven imperatively via --p */}
      <div className="landing-progress" aria-hidden="true">
        <div className="landing-progress-bar" ref={progressBarRef} style={{ ["--p" as string]: 0 }} />
      </div>

      {/* Header — the .scrolled state class is toggled imperatively */}
      <header className="landing-header" ref={headerRef}>
        <div className="landing-nav">
          <Link href="/" className="landing-brand" aria-label="SmartBot — الرئيسية">
            <span className="landing-brand-mark" aria-hidden="true">S</span>
            <span className="landing-brand-text">
              <span className="landing-brand-name">SmartBot</span>
              <span className="landing-brand-sub">إدارة صفحات فيسبوك</span>
            </span>
          </Link>

          <nav className="landing-nav-links" aria-label="أقسام الرحلة">
            <div
              className={`landing-nav-group${megamenuOpen ? " open" : ""}`}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  setMegamenuOpen(false);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape" && megamenuOpen) {
                  setMegamenuOpen(false);
                  megamenuTriggerRef.current?.focus();
                }
              }}
            >
              <button
                type="button"
                className="landing-nav-link"
                aria-haspopup="true"
                aria-expanded={megamenuOpen}
                ref={megamenuTriggerRef}
                onClick={() => setMegamenuOpen((v) => !v)}
              >
                المنصّة
                <ChevronDown size={14} aria-hidden="true" />
              </button>
              <div className="landing-megamenu" onClick={closeMegamenu}>
                <a href="#features" className="landing-megamenu-item">
                  <span className="ln-menu-ico azure" aria-hidden="true"><Bot size={20} /></span>
                  <span className="landing-megamenu-item-body">
                    <span className="landing-megamenu-item-title">الميزات</span>
                    <span className="landing-megamenu-item-desc">ثماني قدرات في مدار واحد</span>
                  </span>
                </a>
                <a href="#journey" className="landing-megamenu-item">
                  <span className="ln-menu-ico gold" aria-hidden="true"><Route size={20} /></span>
                  <span className="landing-megamenu-item-body">
                    <span className="landing-megamenu-item-title">رحلة التشغيل</span>
                    <span className="landing-megamenu-item-desc">من الربط إلى الأتمتة</span>
                  </span>
                </a>
                <a href="#progress" className="landing-megamenu-item">
                  <span className="ln-menu-ico mist" aria-hidden="true"><BarChart3 size={20} /></span>
                  <span className="landing-megamenu-item-body">
                    <span className="landing-megamenu-item-title">قصة التقدّم</span>
                    <span className="landing-megamenu-item-desc">أرقام المنصّة الحقيقية</span>
                  </span>
                </a>
                <a href="#plate" className="landing-megamenu-item">
                  <span className="ln-menu-ico gold" aria-hidden="true"><Share2 size={20} /></span>
                  <span className="landing-megamenu-item-body">
                    <span className="landing-megamenu-item-title">القنوات</span>
                    <span className="landing-megamenu-item-desc">تعليقات ورسائل ومنشورات</span>
                  </span>
                </a>
              </div>
            </div>
            <a href="#features" className="landing-nav-link">الميزات</a>
            <a href="#journey" className="landing-nav-link">الرحلة</a>
            <a href="#progress" className="landing-nav-link">النتائج</a>
          </nav>

          <div className="landing-header-cta">
            <Link href="/demo" className="ln-btn-ghost">جرّب البوت</Link>
            <Link href="/subscribe" className="ln-btn-gold">
              ابدأ مجاناً
              <ArrowLeft size={14} aria-hidden="true" />
            </Link>
          </div>

          <button
            type="button"
            className="landing-burger"
            aria-label={menuOpen ? "إغلاق القائمة" : "فتح القائمة"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>

        {menuOpen && (
          <nav className="landing-mobile-menu" aria-label="قائمة الجوال" onClick={() => setMenuOpen(false)}>
            <a href="#features" className="ln-btn-ghost">الميزات</a>
            <a href="#journey" className="ln-btn-ghost">رحلة التشغيل</a>
            <a href="#progress" className="ln-btn-ghost">النتائج</a>
            <a href="#plate" className="ln-btn-ghost">القنوات</a>
            <a href="#roles" className="ln-btn-ghost">الأدوار</a>
            <Link href="/demo" className="ln-btn-ghost">جرّب البوت</Link>
            <Link href="/subscribe" className="ln-btn-gold">
              ابدأ مجاناً
              <ArrowLeft size={16} aria-hidden="true" />
            </Link>
          </nav>
        )}
      </header>
    </>
  );
}
