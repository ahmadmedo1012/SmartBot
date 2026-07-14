import Link from "next/link"
import { cn } from "@/lib/utils"
import { MessageCircle } from "lucide-react"

interface FooterProps { className?: string }

const QUICK_LINKS = [
  { href: "/pricing", label: "الخطط" },
  { href: "/demo", label: "منيو تجريبي" },
  { href: "/login", label: "تسجيل الدخول" },
  { href: "/subscribe", label: "اشترك الآن" },
]

const SERVICES = [
  { href: "https://menu.smart-link.ly", label: "منيو إلكتروني" },
  { href: "https://menu.smart-link.ly/menu/al-waha-cafe", label: "طلب عبر واتساب" },
  { label: "برنامج ولاء" },
  { label: "إحصائيات وتحليلات" },
  { label: "QR كود مخصص" },
]

export function Footer({ className }: FooterProps) {
  return (
    <footer className={cn("border-t border-border/50 pt-12 sm:pt-16 pb-8 sm:pb-10", className)}>
      <div className="max-w-[1220px] mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-8 mb-10 sm:mb-12">
          <div className="col-span-2 sm:col-span-1">
            <img src="/static/brand-icon.png" alt="الربط الذكي" className="h-7 w-auto mb-4" />
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              منصة رقمية لإدارة صفحات فيسبوك — ردود تلقائية، تحليلات، وجدولة منشورات بذكاء
            </p>
            <div className="flex gap-2">
              <span className="size-8 rounded-sm bg-card border border-border flex items-center justify-center opacity-40 cursor-not-allowed" aria-label="قريباً">
                <svg className="size-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              </span>
              <span className="size-8 rounded-sm bg-card border border-border flex items-center justify-center opacity-40 cursor-not-allowed" aria-label="قريباً">
                <svg className="size-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>
              </span>
              <span className="size-8 rounded-sm bg-card border border-border flex items-center justify-center opacity-40 cursor-not-allowed" aria-label="قريباً">
                <svg className="size-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.38.55A3.02 3.02 0 0 0 .5 6.19 31.6 31.6 0 0 0 0 12a31.6 31.6 0 0 0 .5 5.81 3.02 3.02 0 0 0 2.12 2.14c1.88.55 9.38.55 9.38.55s7.5 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14A31.6 31.6 0 0 0 24 12a31.6 31.6 0 0 0-.5-5.81zM9.55 15.57V8.43L15.82 12l-6.27 3.57z"/></svg>
              </span>
              <a href="https://wa.me/218910089975" className="size-8 rounded-sm bg-card border border-border flex items-center justify-center hover:bg-orange/20 transition-colors" aria-label="واتساب"><MessageCircle className="size-3.5" /></a>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium mb-3">روابط سريعة</h4>
            <div className="space-y-2.5 text-sm text-muted-foreground">
              {QUICK_LINKS.map((link) => (
                <Link key={link.label} href={link.href} className="block w-fit hover:text-foreground transition-colors">{link.label}</Link>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium mb-3">الخدمات</h4>
            <div className="space-y-2.5 text-sm text-muted-foreground">
              {SERVICES.map((svc, i) => (
                svc.href ? <Link key={i} href={svc.href} className="block w-fit hover:text-foreground transition-colors">{svc.label}</Link>
                  : <span key={i} className="block w-fit cursor-default">{svc.label}</span>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium mb-3">تواصل معنا</h4>
            <div className="space-y-2.5 text-sm text-muted-foreground">
              <a href="https://wa.me/218910089975" className="flex items-center gap-2 hover:text-foreground transition-colors"><MessageCircle className="size-4" /> واتساب</a>
              <span className="block">دعم فني 24/7</span>
            </div>
          </div>
        </div>

        <div className="border-t border-border/50 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <span>© 2026 الربط الذكي | SmartBot. جميع الحقوق محفوظة.</span>
          <div className="flex gap-4">
            <span className="hover:text-foreground cursor-pointer">شروط الاستخدام</span>
            <span className="hover:text-foreground cursor-pointer">سياسة الخصوصية</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
