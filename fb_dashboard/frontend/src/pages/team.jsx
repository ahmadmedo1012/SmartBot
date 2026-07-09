import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
function api(path, opts = {}) {
  return fetch(path, {
    ...opts,
    headers: opts.body instanceof FormData ? {} : { "Content-Type": "application/json", ...opts.headers },
  }).then((r) => { if (!r.ok) throw new Error("Request failed"); return r.json() })
}
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import {
  Users, UserPlus, UserCheck, UserCog, Activity, Clock,
  AlertCircle, Shield, Mail, Reply, Edit3, UserMinus,
  RefreshCw, User as UserIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ---- API ----
function fetchTeamMembers() { return api("/api/team/members") }
function fetchTeamActivity(days) { return api(`/api/team/activity?days=${days}`) }
function fetchTeamPerformance() { return api("/api/team/performance") }
function fetchRoleSummary() { return api("/api/team/role-summary") }

const ROLE_LABELS = { admin: "مدير", editor: "محرر", viewer: "مشاهد" }
const ROLE_BADGE = {
  admin: "bg-primary/10 text-primary hover:bg-primary/20 border-primary/20",
  editor: "bg-sky-500/10 text-sky-600 hover:bg-sky-500/20 border-sky-500/20 dark:text-sky-400",
  viewer: "bg-muted text-muted-foreground hover:bg-muted/80 border-transparent",
}
const ACTIVITY_ICONS = {
  reply: Reply, comment: Mail, mention: AtSign, login: UserCheck,
  edit: Edit3, remove: UserMinus, invite: UserPlus, default: Activity,
}
const ACTIVITY_COLORS = {
  reply: "text-accent bg-accent/10",
  comment: "text-blue-500 bg-blue-500/10",
  mention: "text-violet-500 bg-violet-500/10",
  login: "text-primary bg-primary/10", edit: "text-amber-500 bg-amber-500/10",
  remove: "text-destructive bg-destructive/10", invite: "text-accent bg-accent/10",
  default: "text-muted-foreground bg-muted",
}

function timeAgo(date) {
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (diff < 60) return "الآن"
  if (diff < 3600) return `منذ ${Math.floor(diff / 60)} دقيقة`
  if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} ساعة`
  return `منذ ${Math.floor(diff / 86400)} يوم`
}

// ---- Invite Dialog ----
function InviteDialog({ trigger }) {
  const [open, setOpen] = useState(false)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState("viewer")
  const queryClient = useQueryClient()

  const inviteMut = useMutation({
    mutationFn: () => api("/api/team/members", {
      method: "POST",
      body: JSON.stringify({ username, password, role }),
    }),
    onSuccess: () => {
      // ponytail: removed unused
            // queryClient.invalidateQueries({ queryKey: ["team-members"] })
      // ponytail: removed unused
            // queryClient.invalidateQueries({ queryKey: ["role-summary"] })
      setOpen(false); setUsername(""); setPassword(""); setRole("viewer")
      toast.success("تمت إضافة العضو")
    },
    onError: (e) => toast.error(e.message),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!username || !password) return toast.error("يرجى تعبئة جميع الحقول")
    inviteMut.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="glass-heavy">
        <DialogHeader><DialogTitle>دعوة عضو جديد</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">اسم المستخدم</label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} required dir="ltr" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">كلمة المرور</label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">الدور</label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">مشاهد</SelectItem>
                <SelectItem value="editor">محرر</SelectItem>
                <SelectItem value="admin">مدير</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button type="submit" disabled={inviteMut.isPending}>
              {inviteMut.isPending ? "جاري..." : "دعوة"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function AtSign(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
    </svg>
  )
}

// ---- Stats Card ----
function StatCard({ icon: Icon, label, value, color }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn("rounded-full p-2.5 shrink-0", color || "bg-muted")}>
          <Icon className={cn("h-5 w-5", color ? "text-white" : "text-muted-foreground")} />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
          <p className="text-xs text-muted-foreground truncate">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}

// ---- Member Card ----
function MemberCard({ member }) {
  const initial = (member.username || "?").charAt(0).toUpperCase()
  const gradient = `hsl(${member.id * 37 % 360}, 55%, 45%)`

  return (
    <Card className="group relative overflow-hidden transition-shadow hover:shadow-md">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white"
            style={{ background: gradient }}
          >
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground truncate">{member.username}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {member.replies_count != null && `${member.replies_count} ردود`}
              {member.last_active && ` · ${timeAgo(member.last_active)}`}
            </p>
            <div className="mt-2">
              <Badge className={cn("text-xs rounded-full", ROLE_BADGE[member.role] || ROLE_BADGE.viewer)}>
                <Shield className="h-3 w-3 ml-1" />{ROLE_LABELS[member.role] || member.role}
              </Badge>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ---- Activity Item ----
function ActivityItem({ activity }) {
  const Icon = ACTIVITY_ICONS[activity.type] || ACTIVITY_ICONS.default
  const colorClass = ACTIVITY_COLORS[activity.type] || ACTIVITY_COLORS.default

  return (
    <div className="flex gap-3 py-3">
      <div className={cn("rounded-full p-2 shrink-0 mt-0.5", colorClass)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground">
          <span className="font-semibold">{activity.user}</span>
          <span className="text-muted-foreground"> {activity.action}</span>
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
          <Clock className="h-3 w-3 inline" />{timeAgo(activity.created_at || activity.timestamp)}
        </p>
      </div>
    </div>
  )
}

// ---- Main Page ----
export function Team({ role }) {
  useEffect(() => { document.title = "فريق العمل | SmartBot" }, [])
  const [activityDays, setActivityDays] = useState(7)

  const { data: members = [], isLoading: membersLoading, error: membersErr, refetch: refetchMembers } = useQuery({
    queryKey: ["team-members"], queryFn: fetchTeamMembers,
    staleTime: 15000, refetchOnWindowFocus: true,
  })
  const { data: activities = [], isLoading: activitiesLoading } = useQuery({
    queryKey: ["team-activity", activityDays], queryFn: () => fetchTeamActivity(activityDays),
    staleTime: 15000, refetchOnWindowFocus: true,
  })
  const { data: perf, isLoading: perfLoading } = useQuery({
    queryKey: ["team-performance"], queryFn: fetchTeamPerformance, enabled: false, // ponytail: lazy load
  })
  const { data: roleSummary, isLoading: summaryLoading } = useQuery({
    queryKey: ["role-summary"], queryFn: fetchRoleSummary,
    staleTime: 30000, refetchOnWindowFocus: true,
  })

  const summary = roleSummary || {}
  const totalMembers = members.length || summary.total || 0
  const totalRoles = Object.keys(ROLE_LABELS).filter((r) => (summary[r] || 0) > 0 || members.some((m) => m.role === r)).length

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="content-container space-y-6"
    >
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-gradient-premium text-2xl font-bold tracking-tight">فريق العمل</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {totalMembers} عضو · {totalRoles} أدوار
          </p>
        </div>
        <InviteDialog trigger={
          <Button disabled={!isAdmin}><UserPlus className="ml-2 h-4 w-4" />دعوة عضو</Button>
        } />
      </div>

      {/* ── Role Summary ── */}
      {summaryLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard icon={Users} label="إجمالي الأعضاء" value={summary.total ?? totalMembers} color="bg-primary" />
          <StatCard icon={UserCog} label="مدير" value={summary.admin ?? 0} color="bg-warning" />
          <StatCard icon={UserCheck} label="محرر" value={summary.editor ?? 0} color="bg-info" />
          <StatCard icon={UserIcon} label="مشاهد" value={summary.viewer ?? 0} color="bg-muted-foreground" />
        </div>
      )}

      {/* ── Members Grid ── */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">الأعضاء</h2>
        {membersLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
            ))}
          </div>
        ) : membersErr ? (
          <div className="flex flex-col items-center py-12 text-center">
            <div className="rounded-full bg-destructive/10 p-4 mb-4"><AlertCircle className="h-10 w-10 text-destructive" /></div>
            <p className="text-muted-foreground mb-4">فشل تحميل الأعضاء</p>
            <Button variant="outline" onClick={refetchMembers}><RefreshCw className="ml-2 h-4 w-4" />إعادة المحاولة</Button>
          </div>
        ) : members.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
            <div className="rounded-full bg-muted p-5"><Users className="h-12 w-12 text-muted-foreground/50" /></div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">لا يوجد أعضاء</h2>
              <p className="text-sm text-muted-foreground mt-1">قم بدعوة أول عضو للفريق</p>
            </div>
            <InviteDialog trigger={<Button disabled={!isAdmin}><UserPlus className="ml-2 h-4 w-4" />دعوة عضو</Button>} />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {members.map((m) => <MemberCard key={m.id} member={m} isAdmin={isAdmin} />)}
          </div>
        )}
      </div>

      {/* ── Activity Feed ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">النشاطات</h2>
          <div className="flex items-center gap-1 text-sm">
            <Button
              variant={activityDays === 1 ? "default" : "ghost"} size="sm"
              onClick={() => setActivityDays(1)}
              className="h-8 px-2.5"
            >اليوم</Button>
            <Button
              variant={activityDays === 7 ? "default" : "ghost"} size="sm"
              onClick={() => setActivityDays(7)}
              className="h-8 px-2.5"
            >7 أيام</Button>
            <Button
              variant={activityDays === 30 ? "default" : "ghost"} size="sm"
              onClick={() => setActivityDays(30)}
              className="h-8 px-2.5"
            >30 يوم</Button>
          </div>
        </div>
        {activitiesLoading ? (
          <div className="rounded-lg border p-4 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center space-y-3 rounded-lg border">
            <div className="rounded-full bg-muted p-4"><Activity className="h-8 w-8 text-muted-foreground/50" /></div>
            <div>
              <p className="text-sm font-semibold text-foreground">لا توجد نشاطات</p>
              <p className="text-xs text-muted-foreground mt-1">لايوجد نشاط خلال هذه الفترة</p>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border divide-y">
            {activities.map((a, i) => <ActivityItem key={a.id || i} activity={a} />)}
          </div>
        )}
      </div>
      <div className="mobile-nav-spacer" />
    </motion.div>
  )
}
