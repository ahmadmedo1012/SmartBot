"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Send, Plus, Trash2, Users, Loader2 } from "lucide-react"

function maskChatId(id: string): string {
  if (id.length <= 4) return id
  return id.slice(0, 4) + "..." + id.slice(-3)
}

interface Target {
  id: number
  label: string
  chatId: string
  isActive: boolean
  createdAt: string
}

export function BroadcastTargetsSection({
  targets, linkedAdmins,
  onAdd, onToggle, onDelete,
}: {
  targets: Target[]
  linkedAdmins: number
  onAdd: (label: string, chatId: string) => Promise<void>
  onToggle: (id: number, active: boolean) => Promise<void>
  onDelete: (id: number) => Promise<void>
}) {
  const [newLabel, setNewLabel] = useState("")
  const [newChatId, setNewChatId] = useState("")
  const [adding, setAdding] = useState(false)

  const handleAdd = async () => {
    if (!newChatId.trim()) return
    setAdding(true)
    await onAdd(newLabel.trim(), newChatId.trim())
    setNewLabel("")
    setNewChatId("")
    setAdding(false)
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Send className="size-5 text-muted-foreground" />
        <h3 className="text-lg font-semibold">جهات الإرسال (Broadcast Targets)</h3>
      </div>
      <div className="rounded-md bg-card/50 border border-border/30 overflow-hidden">
        <div className="p-5 space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label htmlFor="tg-new-label">تسمية</Label>
              <Input id="tg-new-label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
                placeholder="مثال: قناة الإشعارات" className="h-11 rounded-xl mt-1.5" />
            </div>
            <div className="flex-1">
              <Label htmlFor="tg-new-chatid">معرف المحادثة</Label>
              <Input id="tg-new-chatid" value={newChatId} onChange={(e) => setNewChatId(e.target.value)}
                placeholder="-100xxxx" className="h-11 rounded-xl mt-1.5 text-left" dir="ltr" />
            </div>
            <Button onClick={handleAdd} disabled={adding || !newChatId.trim()} className="rounded-xl gap-1 shrink-0">
              {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              إضافة
            </Button>
          </div>
          {targets.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">لا توجد جهات إرسال مضافة</p>
          ) : (
            <div className="space-y-2">
              {targets.map((t) => (
                <div key={t.id} className="flex items-center gap-3 p-3 rounded-xl bg-background/50 border border-border/20">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.label || t.chatId}</p>
                    <p className="text-xs font-mono text-muted-foreground" dir="ltr">{maskChatId(t.chatId)}</p>
                  </div>
                  <Switch checked={t.isActive} onCheckedChange={(v) => onToggle(t.id, v)} />
                  <Button variant="destructive" size="sm" onClick={() => onDelete(t.id)} className="rounded-xl">
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            <Users className="size-4 inline-block align-text-bottom ml-1" />
            عدد المشرفين المرتبطين: {linkedAdmins}
          </p>
        </div>
      </div>
    </section>
  )
}
