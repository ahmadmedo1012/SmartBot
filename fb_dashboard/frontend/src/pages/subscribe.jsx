import { useState } from "react"
import { PublicHeader } from "@/components/PublicHeader"
import { PublicFooter } from "@/components/PublicFooter"
import { OrangeButton } from "@/components/OrangeButton"
import { SectionContainer } from "@/components/SectionContainer"

const plans = [
  { id: "free", name: "مجاني", price: "0", users: "1", replies: "100/شهر", pages: "1" },
  { id: "basic", name: "أساسي", price: "29", users: "3", replies: "غير محدود", pages: "5" },
  { id: "pro", name: "احترافي", price: "79", users: "10", replies: "غير محدود", pages: "10" },
]

export function Subscribe() {
  const [selectedPlan, setSelectedPlan] = useState("basic")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: selectedPlan, name, email }),
      })
      if (!res.ok) throw new Error()
    } catch (_) { /* ponytail: fire-and-forget, register handles the real signup */ }
    window.location.href = "/register"
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
      <PublicHeader />
      <main className="flex-1 flex items-center justify-center px-4 py-20">
        <div className="w-full max-w-4xl">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">اختر خطتك</h1>
            <p className="text-gray-400 text-lg">ابدأ تجربتك المجانية لمدة 14 يوماً،无需 بطاقة ائتمان</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12" dir="rtl">
            {plans.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPlan(p.id)}
                className={`relative p-6 rounded-2xl border-2 text-right transition-all cursor-pointer ${
                  selectedPlan === p.id
                    ? "border-orange-500 bg-orange-500/10 shadow-lg shadow-orange-500/20"
                    : "border-gray-700 bg-gray-800/50 hover:border-gray-500"
                }`}
              >
                {p.id === "basic" && (
                  <span className="absolute -top-3 right-4 bg-orange-500 text-xs px-3 py-1 rounded-full font-semibold">
                    الأكثر طلباً
                  </span>
                )}
                <h3 className="text-xl font-bold mb-1">{p.name}</h3>
                <p className="text-3xl font-bold mb-4">
                  {p.price === "0" ? "مجاني" : `${p.price} ر.س`}
                  {p.price !== "0" && <span className="text-sm text-gray-400 font-normal">/شهر</span>}
                </p>
                <ul className="space-y-2 text-sm text-gray-300">
                  <li>{p.replies} ردود</li>
                  <li>{p.pages} صفحة</li>
                  <li>{p.users} مستخدم</li>
                </ul>
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="max-w-md mx-auto space-y-4" dir="rtl">
            <input
              type="text"
              placeholder="الاسم الكامل"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
            />
            <input
              type="email"
              placeholder="البريد الإلكتروني"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
            />
            <OrangeButton type="submit" className="w-full py-3 text-lg">
              ابدأ التجربة المجانية
            </OrangeButton>
          </form>
        </div>
      </main>
      <PublicFooter />
    </div>
  )
}
