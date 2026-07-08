import { motion } from "framer-motion"
import { useState, useEffect, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { useAdaptiveInterval } from "@/hooks/use-refresh-engine"
import { fetchFacebookInsights } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Area, AreaChart, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts"
import { TrendingUp, Users, Eye, Activity, BarChart3, RefreshCw, AlertCircle } from "lucide-react"

export function Insights(_props) {
  useEffect(() => { document.title = "التحليلات | SmartBot" }, [])
  const [days, setDays] = useState("7")

  const insightInterval = useAdaptiveInterval("background")
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["fb-insights", days],
    queryFn: () => fetchFacebookInsights(parseInt(days)),
    staleTime: 120000, refetchOnWindowFocus: true,
    refetchInterval: insightInterval, retry: 2,
    placeholderData: (prev) => prev,
  })

  const chartData = useMemo(() => {
    if (!data?.metrics?.page_impressions) return []
    const impressions = data.metrics.page_impressions || []
    const engaged = data.metrics.page_engaged_users || []
    const map = {}
    for (const v of impressions) map[v.date] = { date: v.date, impressions: v.value }
    for (const v of engaged) if (map[v.date]) map[v.date].engaged = v.value
    return Object.values(map)
  }, [data])

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }} className="content-container space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-gradient-premium text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="size-6 text-primary" />
            تحليلات الصفحة
          </h1>
          <p className="text-sm text-muted-foreground mt-1">إحصائيات فيسبوك المباشرة — مثل Meta Business Suite</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-full sm:w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 أيام</SelectItem>
              <SelectItem value="28">28 يوم</SelectItem>
              <SelectItem value="90">90 يوم</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading} className="min-h-[44px] sm:min-h-0">
            <RefreshCw className={`size-4 ml-1 ${isLoading ? "animate-spin" : ""}`} />
            تحديث
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center py-16">
          <AlertCircle className="size-12 text-destructive mb-4" />
          <p className="text-sm text-muted-foreground mb-4">فشل تحميل التحليلات — تأكد من صلاحيات التوكن</p>
          <Button variant="outline" onClick={() => refetch()}><RefreshCw className="size-4 ml-1" />إعادة</Button>
        </div>
      ) : data ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary"><Eye className="size-5" /></div>
                  <div>
                    <p className="text-xs text-muted-foreground">الوصول</p>
                    <p className="text-lg font-bold font-mono tabular-nums">{(data.totals?.page_impressions || 0).toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-info/15 text-info"><Activity className="size-5" /></div>
                  <div>
                    <p className="text-xs text-muted-foreground">التفاعل</p>
                    <p className="text-lg font-bold font-mono tabular-nums">{(data.totals?.page_engaged_users || 0).toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-success/15 text-success"><Users className="size-5" /></div>
                  <div>
                    <p className="text-xs text-muted-foreground">متابعون</p>
                    <p className="text-lg font-bold font-mono tabular-nums">{(data.follower_count || 0).toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-warning/15 text-warning"><TrendingUp className="size-5" /></div>
                  <div>
                    <p className="text-xs text-muted-foreground">معدل التفاعل</p>
                    <p className="text-lg font-bold font-mono tabular-nums">{data.engagement_rate || 0}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Eye className="size-4 text-muted-foreground" />
                  الوصول اليومي
                </CardTitle>
              </CardHeader>
              <CardContent>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={chartData}>
                      <defs><linearGradient id="reachG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.2} /><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} /></linearGradient></defs>
                      <XAxis dataKey="date" tick={{fontSize:10}} axisLine={false} tickLine={false} tickFormatter={d => d?.slice(5) || ''} />
                      <YAxis tick={{fontSize:10}} axisLine={false} tickLine={false} />
                      <Tooltip />
                      <Area type="monotone" dataKey="impressions" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#reachG)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : <p className="text-sm text-muted-foreground text-center py-8">بيانات غير كافية</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Activity className="size-4 text-muted-foreground" />
                  التفاعل اليومي
                </CardTitle>
              </CardHeader>
              <CardContent>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartData}>
                      <XAxis dataKey="date" tick={{fontSize:10}} axisLine={false} tickLine={false} tickFormatter={d => d?.slice(5) || ''} />
                      <YAxis tick={{fontSize:10}} axisLine={false} tickLine={false} />
                      <Tooltip />
                      <Bar dataKey="engaged" fill="hsl(var(--info))" radius={[3,3,0,0]} maxBarSize={24} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="text-sm text-muted-foreground text-center py-8">بيانات غير كافية</p>}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}

      <div className="mobile-nav-spacer" />
    </motion.div>
  )
}
