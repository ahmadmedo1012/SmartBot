import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchUsers, createUser, updateUser, deleteUser } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { Plus, Pencil, Trash2, AlertCircle, Shield, Users as UsersIcon } from "lucide-react"
import { cn } from "@/lib/utils"

const ROLE_LABELS = { admin: "مدير", editor: "محرر", viewer: "مشاهد" }
const ROLE_COLORS = {
  admin: "bg-primary/10 text-primary border-primary/20",
  editor: "bg-primary/10 text-primary border-primary/20",
  viewer: "bg-muted text-muted-foreground border-transparent",
}

function UserDialog({ trigger, title, initial, onSubmit }) {
  const [open, setOpen] = useState(false)
  const [username, setUsername] = useState(initial?.username || "")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState(initial?.role || "viewer")

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit({ ...initial, username, password, role }, () => setOpen(false))
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground">اسم المستخدم</label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} required disabled={!!initial} />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">{initial ? "كلمة مرور جديدة (اترك فارغاً)" : "كلمة المرور"}</label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required={!initial} />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">الصلاحية</label>
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
            <Button type="submit">{initial ? "تحديث" : "إضافة"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function Users({ role }) {
  useEffect(() => { document.title = "المستخدمين | SmartBot" }, [])
  const isAdmin = role === "admin"
  const queryClient = useQueryClient()
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const { data: users = [], isLoading, error, refetch } = useQuery({
    queryKey: ["users"], queryFn: fetchUsers,
  })

  const createMut = useMutation({
    mutationFn: (d) => createUser(d.username, d.password, d.role),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["users"] }); toast.success("تمت إضافة المستخدم") },
    onError: (e) => toast.error(e.message),
  })

  const updateMut = useMutation({
    mutationFn: (d) => updateUser(d.id, d.role, d.password),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["users"] }); toast.success("تم التحديث") },
    onError: (e) => toast.error(e.message),
  })

  const deleteMut = useMutation({
    mutationFn: (id) => deleteUser(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["users"] }); setDeleteConfirm(null); toast.success("تم الحذف") },
    onError: (e) => toast.error(e.message),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">المستخدمين</h1>
          <p className="text-sm text-muted-foreground mt-1">إدارة المستخدمين والصلاحيات</p>
        </div>
        <UserDialog title="إضافة مستخدم جديد" trigger={
          <Button disabled={!isAdmin}><Plus className="ml-2 h-4 w-4" />إضافة مستخدم</Button>
        } onSubmit={(d, close) => createMut.mutate(d, { onSuccess: close })} />
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-lg border p-4 space-y-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center py-16 text-center">
          <div className="rounded-full bg-destructive/10 p-4 mb-4"><AlertCircle className="h-10 w-10 text-destructive" /></div>
          <p className="text-muted-foreground mb-4">{error.message}</p>
          <Button variant="outline" onClick={refetch}>إعادة المحاولة</Button>
        </div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
          <div className="rounded-full bg-muted p-5"><UsersIcon className="h-12 w-12 text-muted-foreground/50" /></div>
          <div><h2 className="text-lg font-semibold text-foreground">لا يوجد مستخدمين</h2><p className="text-sm text-muted-foreground mt-1">قم بإضافة أول مستخدم للبدء</p></div>
          <UserDialog title="إضافة مستخدم جديد" trigger={<Button disabled={!isAdmin}><Plus className="ml-2 h-4 w-4" />إضافة مستخدم</Button>}
            onSubmit={(d, close) => createMut.mutate(d, { onSuccess: close })} />
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <div className="data-table-wrapper"><table className="data-table">
            <thead>
              <tr>
                <th scope="col">المستخدم</th>
                <th scope="col">الصلاحية</th>
                <th scope="col">تاريخ الإضافة</th>
                <th className="w-24" scope="col">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="font-medium">{u.username}</td>
                  <td>
                    <Badge className={cn("text-xs rounded-full", ROLE_COLORS[u.role])}>
                      <Shield className="h-3 w-3 ml-1" />{ROLE_LABELS[u.role]}
                    </Badge>
                  </td>
                  <td className="text-sm text-muted-foreground">{u.created_at?.slice(0, 10) || "-"}</td>
                  <td>
                    <div className="flex gap-1">
                      {isAdmin && (
                        <>
                          <UserDialog title="تعديل المستخدم" initial={u}
                            trigger={<Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground"><Pencil className="h-4 w-4" /></Button>}
                            onSubmit={(d, close) => updateMut.mutate(d, { onSuccess: close })} />
                          <Button variant="ghost" size="icon"
                            onClick={() => setDeleteConfirm(u)}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}

      <Dialog open={!!deleteConfirm} onOpenChange={(o) => { if (!o) setDeleteConfirm(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>تأكيد الحذف</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">هل أنت متأكد من حذف <strong className="text-foreground">{deleteConfirm?.username}</strong>؟</p>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>إلغاء</Button>
            <Button variant="destructive" onClick={() => deleteMut.mutate(deleteConfirm.id)}>{deleteMut.isPending ? "جاري..." : "حذف"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
