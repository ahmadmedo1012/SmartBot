import { UserCog, Headphones } from "lucide-react";
import { RevealCssClass } from "@/hooks/useReveal";

/* r128 Stage B (F3b) — Chapter 05 «الفريق»: the roles ledger
 * (canonical LandingPage.tsx:616-676 anatomy, PORT-KIT §6 mapping:
 * Bot = page admin/agent). SmartBot's two real audience segments — the
 * page admin (automation owner) and the support agent (unified-inbox
 * operator). Desc + quote fold shipped copy (landing BENEFITS[1]/[7],
 * the team-permissions and unified-inbox capabilities); the quotes are
 * verbatim shipped feature descriptions. */

const ROLES = [
  {
    icon: UserCog, tone: "gold", name: "مدير الصفحة", index: "01",
    desc: "أتمتة كاملة: قواعد الرد، البث الجماعي، جدولة المنشورات، والتقارير — كل أدوات الإدارة من لوحة واحدة.",
    quote: "أضف أعضاء فريقك بصلاحيات مختلفة لإدارة الصفحات معاً.",
  },
  {
    icon: Headphones, tone: "azure", name: "موظف الدعم", index: "02",
    desc: "صندوق وارد موحّد لكل رسائل وتعليقات الصفحات؛ يردّ بواجهة عربية بسيطة ويحيل ما يحتاج قراراً إلى المدير.",
    quote: "إدارة جميع المحادثات من صفحة واحدة بواجهة بسيطة وسهلة.",
  },
];

export function RolesSection() {
  return (
    <section id="roles" className="ln-chapter ln-roles">
      <div className="ln-chapter-head">
        <span className="ln-label">{"05 — الفريق"}</span>
        <RevealCssClass as="h2" className="ln-chapter-title" delay={1}>
          أدوارٌ واضحة <em>وصلاحيات محدّدة</em>
        </RevealCssClass>
        <RevealCssClass as="p" className="ln-chapter-lede" delay={2}>
          كل عضو في فريقك يجد أدواته جاهزة بالعربية — من أول ردّ حتى التقارير.
        </RevealCssClass>
      </div>

      <ul className="ln-roles-list">
        {ROLES.map((r, i) => (
          <RevealCssClass as="li" key={r.name} className="ln-role-row" delay={(i + 1) as 1 | 2}>
            <span className="ln-role-key">
              <span className={`ln-role-ico ${r.tone}`} aria-hidden="true">
                <r.icon size={26} strokeWidth={1.7} />
              </span>
              <span className="ln-role-name">{r.name}</span>
              <span className="ln-role-index ln-mono">{r.index}</span>
            </span>
            <div>
              <p className="ln-role-desc">{r.desc}</p>
              <blockquote className="ln-role-quote">
                <span className="ln-role-quote-mark" aria-hidden="true">”</span>
                {r.quote}
              </blockquote>
            </div>
          </RevealCssClass>
        ))}
      </ul>
    </section>
  );
}
