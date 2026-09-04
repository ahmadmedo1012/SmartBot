import Link from "next/link"

export default function NotFound() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="mb-6">
          <h1 className="text-7xl font-bold bg-gradient-to-br from-orange-500 to-orange-400 bg-clip-text text-transparent">
            404
          </h1>
        </div>
        <h2 className="text-2xl font-bold mb-2">الصفحة غير موجودة</h2>
        <p className="text-muted-foreground mb-6 leading-relaxed">
          الصفحة التي تبحث عنها قد تكون قد نُقلت أو حُذفت أو لم تكن متاحة.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center h-10 px-4 rounded-sm bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition-colors"
          >
            الصفحة الرئيسية
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center h-10 px-4 rounded-sm border border-border bg-transparent hover:bg-muted text-sm font-medium transition-colors"
          >
            لوحة التحكم
          </Link>
        </div>
      </div>
    </div>
  )
}
